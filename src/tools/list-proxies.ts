import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { Proxy, ProxyType } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { parseMskDateTime } from '../utils/datetime.js';

const TYPE_MAP: Record<string, ProxyType> = { mobile: 0, server: 1, backconnect: 2, residential: 3 };

export function registerListProxies(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'list_proxies',
    {
      title: 'List my proxies',
      description:
        'Returns all proxies owned by the authenticated user with full connection ' +
        'details (host, port, login, password, geo, operator, expiration), and the ' +
        'proxy_id values other tools take. Supports ' +
        'filtering by type (mobile/server/backconnect/residential) and by country ' +
        '(ISO code or numeric id_country). Backconnect and residential proxies carry ' +
        'no country id, so a country filter excludes them. The server already drops ' +
        'expired proxies, but active_only rechecks client-side as a safety net.',
      inputSchema: {
        type: z.enum(['mobile', 'server', 'backconnect', 'residential']).optional()
          .describe('Filter by proxy type'),
        country: z.string().length(2).optional()
          .describe('Filter by 2-letter ISO country code (RU, US, TR, ...)'),
        id_country: z.number().int().positive().optional()
          .describe('Filter by numeric country ID; takes precedence over country'),
        active_only: z.boolean().default(true)
          .describe('Hide expired proxies (default: true)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ type, country, id_country, active_only }) => {
      try {
        const typeNum = type !== undefined ? TYPE_MAP[type] : undefined;
        let items = await api.getMyProxy({ type: typeNum });

        let countryId = id_country ?? null;
        if (countryId === null && country) {
          countryId = await api.resolveCountryId(country);
          if (countryId === null) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Country "${country}" not recognized (use a 2-letter ISO code).`,
            );
          }
        }
        if (countryId !== null) {
          items = items.filter((p) => Number(p.id_country) === countryId);
        }
        if (active_only) {
          const nowMs = Date.now();
          items = items.filter((p) => {
            const exp = parseMskDateTime(p.proxy_exp);
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
