import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { PROXY_TYPE_NAMES, type BalanceResponse, type ProxyIpResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { parseMskDateTime } from '../utils/datetime.js';
import { listedBy } from '../utils/blacklist.js';

type Severity = 'critical' | 'warning' | 'info';
interface Issue {
  proxy_id: string;
  proxy_type: string;
  severity: Severity;
  issue: string;
  detail: string;
}
const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function registerGetHealthSnapshot(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_health_snapshot',
    {
      title: 'Account health check',
      description:
        'One-call answer to "is everything OK with my proxies?": balance, proxies expiring ' +
        'soon (flagging whether auto-renewal is on), residential packages running out of ' +
        'traffic, and optionally which dedicated IPs sit on spam blacklists. Returns only ' +
        'what needs attention, ordered critical → warning → info. check_spam=true adds one ' +
        'lookup per mobile/server proxy (up to max_spam_checks), so it is slower.',
      inputSchema: {
        expiring_within_days: z.number().int().min(0).max(30).default(3)
          .describe('Flag proxies that expire within this many days'),
        low_traffic_percent: z.number().min(0).max(100).default(10)
          .describe('Flag residential packages with less than this share of traffic left'),
        check_spam: z.boolean().default(false)
          .describe('Also check each mobile/server IP against spam blacklists (slower)'),
        max_spam_checks: z.number().int().min(1).max(20).default(10)
          .describe('Upper bound on blacklist lookups when check_spam=true'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ expiring_within_days, low_traffic_percent, check_spam, max_spam_checks }) => {
      try {
        const [balance, proxies] = await Promise.all([
          api.call<BalanceResponse>('get_balance'),
          api.getMyProxy({ refresh: true }),
        ]);

        const now = Date.now();
        const issues: Issue[] = [];
        const byType: Record<string, number> = {};
        const spamCandidates: typeof proxies = [];

        for (const p of proxies) {
          const typeNum = Number(p.proxy_type);
          const type = PROXY_TYPE_NAMES[typeNum] ?? String(p.proxy_type);
          const id = String(p.proxy_id);
          byType[type] = (byType[type] ?? 0) + 1;
          const add = (severity: Severity, issue: string, detail: string) =>
            issues.push({ proxy_id: id, proxy_type: type, severity, issue, detail });

          const hoursLeft = (parseMskDateTime(p.proxy_exp) - now) / 3_600_000;
          const autoRenew = String(p.proxy_auto_renewal) === '1' || p.proxy_auto_renewal === true;
          if (hoursLeft < 0) {
            add('critical', 'expired', `expired ${p.proxy_exp} MSK`);
          } else if (hoursLeft <= expiring_within_days * 24) {
            add(
              autoRenew ? 'info' : 'warning',
              'expires_soon',
              `expires ${p.proxy_exp} MSK (in ${Math.round(hoursLeft)} h), auto-renewal ${autoRenew ? 'on — make sure the balance covers it' : 'off'}`,
            );
          }

          if (typeNum === 3) {
            const limit = Number(p.residential_traffic_limit_mb);
            const left = Number(p.residential_traffic_left_mb);
            if (limit > 0 && Number.isFinite(left)) {
              if (left <= 0) add('critical', 'traffic_exhausted', `0 MB of ${limit} MB left — the package needs a traffic top-up`);
              else if ((left / limit) * 100 < low_traffic_percent) add('warning', 'low_traffic', `${left} MB of ${limit} MB left`);
            }
          }

          if ((typeNum === 0 || typeNum === 1) && hoursLeft >= 0) spamCandidates.push(p);
        }

        let spamCheck: { checked: number; skipped: number } | null = null;
        if (check_spam) {
          const batch = spamCandidates.slice(0, max_spam_checks);
          /* Sequential on purpose: the API allows ~3 requests per second per token. */
          for (const p of batch) {
            const r = await api.call<ProxyIpResponse>('proxy_ip', { proxy_id: String(p.proxy_id), check_spam: 'true' });
            const g = r['ipguardian.net'];
            if (g?.found) {
              const mobile = Number(p.proxy_type) === 0;
              issues.push({
                proxy_id: String(p.proxy_id),
                proxy_type: PROXY_TYPE_NAMES[Number(p.proxy_type)] ?? String(p.proxy_type),
                severity: 'critical',
                issue: 'blacklisted',
                detail: `IP ${r.ip} is listed by ${listedBy(g.sources).join(', ') || 'a blacklist'}` +
                  (mobile ? ' — run rotate_until_clean' : ' — static IP, rotation is not available'),
              });
            }
          }
          spamCheck = { checked: batch.length, skipped: spamCandidates.length - batch.length };
        }

        issues.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
        const count = (s: Severity) => issues.filter((i) => i.severity === s).length;
        const out = {
          summary: issues.length
            ? `${proxies.length} proxies: ${count('critical')} critical, ${count('warning')} warning, ${count('info')} info`
            : `${proxies.length} proxies, nothing needs attention`,
          balance_rub: Number(balance.balance),
          proxies_total: proxies.length,
          by_type: byType,
          attention: issues,
          spam_check: spamCheck,
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
