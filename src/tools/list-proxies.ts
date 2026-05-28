import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { Proxy, ProxyType } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

const TYPE_MAP: Record<string, ProxyType> = { mobile: 0, server: 1, backconnect: 2 };

export function registerListProxies(server: McpServer, api: MobileProxyAPI): void {
  server.tool(
    'list_proxies',
    'Returns all proxies owned by the authenticated user with full connection ' +
      'details (host, port, login, password, country, operator, expiration). ' +
      'Use this first when the user asks anything about "my proxies", to find a ' +
      'proxy by country, or to get a proxy_id needed for other tools. Supports ' +
      'filtering by type: mobile / server / backconnect.',
    {
      type: z.enum(['mobile', 'server', 'backconnect']).optional()
        .describe('Filter by proxy type (default: all)'),
      country: z.string().length(2).optional()
        .describe('Filter by ISO country code, e.g. "RU", "US"'),
      active_only: z.boolean().default(true)
        .describe('Hide expired proxies (default: true)'),
    },
    async ({ type, country, active_only }) => {
      try {
        const typeNum = type !== undefined ? TYPE_MAP[type] : undefined;
        const data = await api.getMyProxy({ type: typeNum });

        let items: Proxy[] = data.proxy_list ?? [];

        if (country) {
          const cc = country.toUpperCase();
          items = items.filter((p) => (p.proxy_geo ?? '').toUpperCase() === cc);
        }
        if (active_only) {
          const nowSec = Date.now() / 1000;
          items = items.filter((p) => Number(p.proxy_exp) > nowSec);
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
