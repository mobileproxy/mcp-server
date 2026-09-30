import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ProxyIpResponse } from '../api/types.js';
import { MobileProxyAPIError, toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { listedBy } from '../utils/blacklist.js';

interface Check {
  ip: string;
  listed: boolean;
  listed_by: string[];
}

export function registerRotateUntilClean(
  server: McpServer,
  api: MobileProxyAPI,
  opts: { verifyDelayMs?: number } = {},
): void {
  /* The carrier needs a moment after rotation before proxy_ip reports the new address. */
  const verifyDelayMs = opts.verifyDelayMs ?? 1500;

  server.registerTool(
    'rotate_until_clean',
    {
      title: 'Rotate until the IP is clean',
      description:
        'Gets a mobile proxy onto an IP that is on no spam/abuse blacklist: rotates, checks the ' +
        'new IP and repeats up to max_attempts, in one call instead of chaining rotate_ip and ' +
        'get_proxy_status. With keep_if_clean=true it checks the current IP first and keeps it ' +
        'when clean. Returns status="cooldown" with wait_seconds when the carrier refuses another ' +
        'rotation yet. Active connections drop on each rotation. Mobile proxies only ' +
        '(proxy_type=0), free of charge.',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('Mobile proxy id from list_proxies'),
        max_attempts: z.number().int().min(1).max(5).default(3)
          .describe('Maximum rotations before giving up'),
        keep_if_clean: z.boolean().default(false)
          .describe('Check the current IP first and skip rotation if it is clean'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ proxy_id, max_attempts, keep_if_clean }) => {
      try {
        const proxyKey = await api.getProxyKey(proxy_id);
        if (!proxyKey) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Proxy ${proxy_id} not found or not a mobile proxy (only mobile proxies can rotate). Use list_proxies.`,
          );
        }

        const check = async (): Promise<Check> => {
          const r = await api.call<ProxyIpResponse>('proxy_ip', { proxy_id, check_spam: 'true' });
          const g = r['ipguardian.net'];
          return { ip: r.ip, listed: g?.found === true, listed_by: listedBy(g?.sources ?? []) };
        };
        const result = (status: string, extra: Record<string, unknown>, history: Check[], rotations: number) => ({
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ proxy_id, status, rotations, ...extra, history }, null, 2),
          }],
        });

        const history: Check[] = [];
        if (keep_if_clean) {
          const current = await check();
          history.push(current);
          if (!current.listed) return result('clean', { final_ip: current.ip, kept_current_ip: true }, history, 0);
        }

        let rotations = 0;
        while (rotations < max_attempts) {
          try {
            await api.rotateIp(proxyKey);
          } catch (err) {
            const wait = err instanceof MobileProxyAPIError ? /wait\s+(\d+)\s*s/i.exec(err.message) : null;
            if (wait) {
              return result('cooldown', {
                wait_seconds: Number(wait[1]),
                final_ip: history.at(-1)?.ip ?? null,
                note: 'The carrier refused another rotation yet. Call again after wait_seconds.',
              }, history, rotations);
            }
            throw err;
          }
          rotations += 1;
          if (verifyDelayMs > 0) await new Promise((r) => setTimeout(r, verifyDelayMs));
          const c = await check();
          history.push(c);
          if (!c.listed) return result('clean', { final_ip: c.ip }, history, rotations);
        }

        return result('still_listed', {
          final_ip: history.at(-1)?.ip ?? null,
          note: `Every IP was blacklisted after ${max_attempts} rotations. Try again later or move the proxy with change_geo.`,
        }, history, rotations);
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
