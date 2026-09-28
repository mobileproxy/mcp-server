import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ResidentialTrafficResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

/**
 * Consumption history. The remaining quota itself lives on the proxy record
 * (residential_traffic_left_mb in list_proxies) — this tool answers "how fast
 * is it burning", which is what matters before topping up.
 */
export function registerResidentialTraffic(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_residential_traffic',
    {
      title: 'Residential traffic usage by day',
      description:
        'Returns daily traffic consumption for a residential proxy. Use it to answer ' +
        '"how much have I used / how long will the bundle last". The REMAINING quota ' +
        'is not here — it comes from list_proxies (residential_traffic_left_mb). ' +
        'Combine both to estimate the burn rate before add_residential_traffic.',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('Residential proxy id'),
        days: z.number().int().min(1).max(365).default(30)
          .describe('How many days back to report'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ proxy_id, days }) => {
      try {
        const data = await api.call<ResidentialTrafficResponse>('residential_traffic', {
          proxy_id,
          days,
        });
        const points = data ?? [];
        const total = points.reduce((acc, p) => acc + Number(p.delta_mb || 0), 0);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              proxy_id,
              days,
              total_mb: Math.round(total * 100) / 100,
              avg_mb_per_day: points.length ? Math.round((total / points.length) * 100) / 100 : 0,
              history: points,
            }, null, 2),
          }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
