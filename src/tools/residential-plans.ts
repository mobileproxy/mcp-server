import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ResidentialPlansResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

/**
 * Residential proxies are billed by TRAFFIC VOLUME, not by time — that is the
 * key difference from mobile/server/backconnect plans (get_price). A plan is a
 * data bundle (1/5/10/50/100 GB) valid for a fixed number of days.
 */
export function registerResidentialPlans(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'list_residential_plans',
    {
      title: 'List residential proxy plans',
      description:
        'Returns available residential (home ISP) proxy plans. Unlike mobile proxies, ' +
        'residential is billed BY TRAFFIC VOLUME (GB bundles), not by rental period — ' +
        'so use this instead of get_price when the user asks about residential. ' +
        'The larger the bundle, the lower the price per GB. Call this before ' +
        'buy_residential to pick a price_id and show the cost.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await api.call<ResidentialPlansResponse>('residential_plans', {});
        const plans = (data ?? []).map((p) => ({
          ...p,
          price_per_gb: Number(p.traffic_gb) > 0
            ? Math.round(Number(p.sum) / Number(p.traffic_gb))
            : null,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ plans }, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
