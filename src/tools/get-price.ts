import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { GetPriceResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export function registerGetPrice(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_price',
    {
      title: 'Get proxy price quote',
      description:
        'Returns the price quote for proxies in a given country across all ' +
        'available durations (1, 3, 7, 14, 30, 60, 90, 180, 365 days). Use this ' +
        'to inform the user about cost BEFORE buy_proxy. The country argument ' +
        'accepts a 2-letter ISO code (e.g. "RU") OR a numeric id_country.',
      inputSchema: {
        country: z.union([z.string(), z.number()])
          .describe('ISO country code ("RU", "US", "TR") or numeric id_country'),
        currency: z.enum(['RUB', 'USD']).default('RUB'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ country, currency }) => {
      try {
        const id = await api.resolveCountryId(country);
        if (id === null) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Country "${country}" not recognized. Pass a 2-letter ISO code or numeric id_country.`,
          );
        }

        const params: Record<string, string | number> = {
          id_country: id,
          currency: currency.toLowerCase(), /* API expects "rub" / "usd" lowercase */
        };
        const data = await api.call<GetPriceResponse>('get_price', params);

        /* Sort by period asc for readability */
        const sorted = [...(data.price ?? [])].sort(
          (a, b) => Number(a.period) - Number(b.period),
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  country: { id_country: id, currency },
                  prices: sorted,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
