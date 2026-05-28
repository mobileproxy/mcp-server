import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { toMcpError } from '../api/errors.js';

export function registerGetGeoList(server: McpServer, api: MobileProxyAPI): void {
  server.tool(
    'get_geo_list',
    'Returns all geo-locations (geoid + human caption + ISO + free-modem ' +
      'count) where proxies are currently available for purchase or migration. ' +
      'Use this to: recommend a location to the user, validate before buy_proxy ' +
      'or change_geo, or filter by country (set country to a 2-letter ISO code). ' +
      'The geoid value is needed for buy_proxy. Cached server-side for 60s and ' +
      'client-side for 5 minutes.',
    {
      country: z.string().length(2).optional()
        .describe('Filter to a single country by ISO code (RU, US, TR, ...)'),
    },
    async ({ country }) => {
      try {
        const all = await api.getGeoList();
        const items = country
          ? all.filter((g) => (g.iso ?? '').toUpperCase() === country.toUpperCase())
          : all;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: items.length, geo: items }, null, 2),
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
