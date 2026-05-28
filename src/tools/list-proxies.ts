import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { Proxy, ProxyType } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

const TYPE_MAP: Record<string, ProxyType> = { mobile: 0, server: 1, backconnect: 2, residential: 3 };

/**
 * MySQL DATETIME "YYYY-MM-DD HH:MM:SS" → epoch ms. Treated as UTC for a stable
 * comparison; a ±3h skew vs the server's MSK timezone is harmless for "is this
 * proxy expired" checks since proxies live for days/weeks/months.
 */
function parseDateTime(s: string): number {
  return Date.parse(s.replace(' ', 'T') + 'Z');
}

export function registerListProxies(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'list_proxies',
    {
      title: 'List my proxies',
      description:
        'Returns all proxies owned by the authenticated user with full connection ' +
        'details (host, port, login, password, geo, operator, expiration). ' +
        'Use this first when the user asks anything about "my proxies", to find a ' +
        'specific proxy, or to get a proxy_id needed for other tools. Supports ' +
        'filtering by type (mobile/server/backconnect/residential) and id_country ' +
        '(numeric ID — use get_country_list to resolve from ISO codes; that tool ' +
        'lands in v0.2). The server already drops expired proxies, but active_only ' +
        'rechecks client-side as a safety net.',
      inputSchema: {
        type: z.enum(['mobile', 'server', 'backconnect', 'residential']).optional()
          .describe('Filter by proxy type'),
        id_country: z.number().int().positive().optional()
          .describe('Filter by numeric country ID (not ISO code)'),
        active_only: z.boolean().default(true)
          .describe('Hide expired proxies (default: true)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ type, id_country, active_only }) => {
      try {
        const typeNum = type !== undefined ? TYPE_MAP[type] : undefined;
        let items = await api.getMyProxy({ type: typeNum });

        if (id_country !== undefined) {
          items = items.filter((p) => Number(p.id_country) === id_country);
        }
        if (active_only) {
          const nowMs = Date.now();
          items = items.filter((p) => {
            const exp = parseDateTime(p.proxy_exp);
            return Number.isFinite(exp) ? exp > nowMs : true; /* keep if unparseable */
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: items.length, proxies: items }, null, 2),
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

export type { Proxy };
