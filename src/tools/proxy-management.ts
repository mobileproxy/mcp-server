import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { BuyProxyResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { DASHBOARD_URL } from '../links.js';

const ALLOWED_PERIODS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

const proxyIds = (max: number) =>
  z.array(z.number().int().positive()).min(1).max(max).describe(`proxy_id values from list_proxies (up to ${max})`);
const periodDays = z.number().int().positive()
  .refine((v) => (ALLOWED_PERIODS as readonly number[]).includes(v), { message: 'period_days must be one of 1, 3, 7, 14, 30, 60, 90, 180, 365' })
  .describe('Extension in days; one of 1, 3, 7, 14, 30, 60, 90, 180, 365');

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

/** Renewal reuses buyproxy with a proxy_id list: the backend extends expiry and leaves auto-renewal untouched. */
export function registerRenewProxies(server: McpServer, api: MobileProxyAPI, opts: { purchases?: boolean } = {}): void {
  if (opts.purchases === false) {
    server.registerTool(
      'quote_renewal',
      {
        title: 'Quote a proxy renewal',
        description:
          'Calculates the price of extending one or more mobile, server or backconnect proxies by a ' +
          'period, at the rate that applies to them, without renewing. The account owner renews in ' +
          'the mobileproxy.space dashboard; the result includes that link. Residential proxies are ' +
          'extended by traffic instead (quote_residential_topup).',
        inputSchema: { proxy_ids: proxyIds(100), period_days: periodDays },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ proxy_ids, period_days }) => {
        try {
          const data = await api.call<{ status: 'ok'; amount: number }>('buyproxy', { proxy_id: proxy_ids.join(','), period: period_days, amount_only: 1 });
          return json({ quote_only: true, proxy_ids, period_days, amount: data.amount, currency: 'RUB', checkout_url: DASHBOARD_URL });
        } catch (err) {
          throw toMcpError(err);
        }
      },
    );
    return;
  }

  server.registerTool(
    'renew_proxies',
    {
      title: 'Renew proxies',
      description:
        'Extends one or more mobile, server or backconnect proxies by a period and charges the ' +
        'account balance immediately, at the rate that applies to each proxy. estimate_only=true ' +
        'returns the total without charging. Auto-renewal settings stay as they are. Residential ' +
        'proxies are extended by traffic instead (add_residential_traffic).',
      inputSchema: {
        proxy_ids: proxyIds(100),
        period_days: periodDays,
        estimate_only: z.boolean().default(false).describe('Return the total without charging'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ proxy_ids, period_days, estimate_only }) => {
      try {
        const params: Record<string, string | number> = { proxy_id: proxy_ids.join(','), period: period_days };
        if (estimate_only) params.amount_only = 1;
        const data = await api.call<BuyProxyResponse | { status: 'ok'; amount: number }>('buyproxy', params, { retries: 0 });
        if (!estimate_only) api.invalidateProxyCaches();
        return json(estimate_only ? { estimate_only: true, proxy_ids, period_days, amount: data.amount, note: 'Nothing charged.' } : data);
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

export function registerUpdateProxySettings(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'update_proxy_settings',
    {
      title: 'Update proxy settings',
      description:
        'Changes settings on one or more proxies at once: auto-renewal on or off, a comment, and ' +
        'the timer that rotates a mobile proxy\'s IP automatically every N minutes. Only the ' +
        'settings you pass are changed.',
      inputSchema: {
        proxy_ids: proxyIds(100),
        auto_renewal: z.boolean().optional().describe('Renew automatically from the balance before expiry'),
        comment: z.string().max(190).optional().describe('Free-text label shown in the dashboard; empty string clears it'),
        auto_rotate_minutes: z.number().int().min(0).max(1440)
          .refine((v) => v === 0 || v >= 2, { message: 'auto_rotate_minutes is 0 (off) or 2-1440' })
          .optional()
          .describe('Rotate the IP automatically every N minutes (2-1440); 0 turns the timer off'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ proxy_ids, auto_renewal, comment, auto_rotate_minutes }) => {
      try {
        const params: Record<string, string | number> = { proxy_id: proxy_ids.join(',') };
        if (auto_renewal !== undefined) params.proxy_auto_renewal = auto_renewal ? 1 : 0;
        if (comment !== undefined) params.proxy_comment = comment;
        if (auto_rotate_minutes !== undefined) params.proxy_reboot_time = auto_rotate_minutes;
        if (Object.keys(params).length === 1) {
          throw new McpError(ErrorCode.InvalidParams, 'Pass at least one of auto_renewal, comment or auto_rotate_minutes.');
        }
        const data = await api.call<{ status: 'ok'; proxy_id: Record<string, string | number> }>('edit_proxy', params, { retries: 0 });
        api.invalidateProxyCaches();
        const updated = Object.values(data.proxy_id ?? {}).map(Number);
        return json({
          updated,
          not_found: proxy_ids.filter((id) => !updated.includes(id)),
          changed: {
            ...(auto_renewal !== undefined ? { auto_renewal } : {}),
            ...(comment !== undefined ? { comment } : {}),
            ...(auto_rotate_minutes !== undefined ? { auto_rotate_minutes } : {}),
          },
        });
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

export function registerChangeProxyCredentials(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'change_proxy_credentials',
    {
      title: 'Change proxy login and password',
      description:
        'Sets a new login and password on one or more proxies, for example after credentials ' +
        'leaked. Without login/password new random ones are generated; the same pair is applied to ' +
        'every proxy in the call. Clients still using the old credentials stop connecting. Returns ' +
        'the new credentials for each proxy.',
      inputSchema: {
        proxy_ids: proxyIds(50),
        login: z.string().regex(/^[A-Za-z0-9]{4,32}$/, 'Latin letters and digits, 4-32 characters').optional(),
        password: z.string().regex(/^[A-Za-z0-9]{8,32}$/, 'Latin letters and digits, 8-32 characters').optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ proxy_ids, login, password }) => {
      try {
        const params: Record<string, string | number> = { proxy_id: proxy_ids.join(',') };
        if (login) params.proxy_login = login;
        if (password) params.proxy_pass = password;
        await api.call('change_proxy_login_password', params, { retries: 0 });
        /* The backend echoes only one proxy, so read the new pairs back from the roster. */
        const fresh = await api.getMyProxy({ refresh: true });
        api.invalidateProxyCaches();
        const byId = new Map(fresh.map((p) => [Number(p.proxy_id), p]));
        return json({
          proxies: proxy_ids.map((id) => {
            const p = byId.get(id);
            return p ? { proxy_id: id, login: p.proxy_login, password: p.proxy_pass } : { proxy_id: id, error: 'not found in your account' };
          }),
          note: 'Update every client that used the old credentials. get_connection_string builds ready-to-paste strings.',
        });
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

export function registerRebootModem(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'reboot_modem',
    {
      title: 'Reboot the modem behind a proxy',
      description:
        'Power-cycles the 4G modem behind a mobile proxy, which clears most hangs where the proxy ' +
        'stops passing traffic and rotate_ip does not help. Active connections drop and the proxy ' +
        'is back in about a minute. Allowed once per 30 minutes per proxy.',
      inputSchema: { proxy_id: z.number().int().positive().describe('Mobile proxy_id from list_proxies') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ proxy_id }) => {
      try {
        const data = await api.call<{ status: 'ok'; message: string }>('reboot_proxy', { proxy_id }, { retries: 0 });
        return json({ proxy_id, status: 'rebooting', message: data.message, note: 'The proxy is usually back within a minute.' });
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
