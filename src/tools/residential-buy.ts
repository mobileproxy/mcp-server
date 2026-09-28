import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type {
  ResidentialPlansResponse,
  ResidentialBuyResponse,
  ResidentialAddTrafficResponse,
} from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Both tools here charge the real balance, so they are marked destructive +
 * non-idempotent — the calling agent is expected to confirm with the user first.
 * Each exposes estimate_only as a built-in dry run, mirroring buy_proxy.
 *
 * The backend guards against double-charging with a short purchase lock: a second
 * parallel call returns "Another purchase is in progress" instead of buying twice.
 */

/** Shared: resolve plan and compute the amount without touching money. */
async function quote(api: MobileProxyAPI, price_id: number, num: number) {
  const plans = await api.call<ResidentialPlansResponse>('residential_plans', {});
  const plan = (plans ?? []).find((p) => Number(p.price_id) === price_id);
  if (!plan) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Plan ${price_id} not found. Call list_residential_plans for valid price_id values.`,
    );
  }
  return {
    plan,
    amount: Number(plan.sum) * num,
    traffic_mb: Number(plan.traffic_mb) * num,
  };
}

export function registerResidentialBuy(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'buy_residential',
    {
      title: 'Purchase a residential proxy package',
      description:
        'Buys a residential (home ISP) proxy — a TRAFFIC BUNDLE, not a time rental. ' +
        'Charges the balance IMMEDIATELY — REQUIRES explicit user confirmation. ' +
        'Call list_residential_plans and get_balance first, and prefer a dry run with ' +
        'estimate_only=true to show the exact amount. country is optional: without it ' +
        'the pool is global, and it can be changed later for free via set_residential_geo.',
      inputSchema: {
        price_id: z.number().int().positive()
          .describe('Plan id from list_residential_plans'),
        num: z.number().int().min(1).max(100).default(1)
          .describe('Plan multiplier: num=2 on a 10 GB plan buys 20 GB'),
        country: z.string().length(2).optional()
          .describe('ISO2 country code; omit for a global pool'),
        estimate_only: z.boolean().default(false)
          .describe('Dry run: returns the amount without charging'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ price_id, num, country, estimate_only }) => {
      try {
        const q = await quote(api, price_id, num);

        if (estimate_only) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                estimate_only: true,
                plan: q.plan,
                num,
                country: country ?? null,
                amount: q.amount,
                traffic_mb: q.traffic_mb,
                note: 'Nothing charged. Re-run with estimate_only=false to purchase.',
              }, null, 2),
            }],
          };
        }

        const params: Record<string, string | number> = { price_id, num };
        if (country) params.country = country.toUpperCase();

        const data = await api.call<ResidentialBuyResponse>('residential_buy', params);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

export function registerResidentialAddTraffic(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'add_residential_traffic',
    {
      title: 'Add traffic to a residential proxy',
      description:
        'Tops up the traffic quota of an EXISTING residential proxy, keeping its current ' +
        'geo settings and connection string. Charges the balance IMMEDIATELY — REQUIRES ' +
        'explicit user confirmation. Use this instead of buy_residential when the user ' +
        'ran out of traffic but wants to keep the same proxy. Check the remaining quota ' +
        'first via list_proxies (residential_traffic_left_mb).',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('Existing residential proxy id'),
        price_id: z.number().int().positive()
          .describe('Plan id from list_residential_plans — defines how much traffic is added'),
        num: z.number().int().min(1).max(100).default(1).describe('Plan multiplier'),
        estimate_only: z.boolean().default(false)
          .describe('Dry run: returns the amount without charging'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ proxy_id, price_id, num, estimate_only }) => {
      try {
        const q = await quote(api, price_id, num);

        if (estimate_only) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                estimate_only: true,
                proxy_id,
                plan: q.plan,
                num,
                amount: q.amount,
                traffic_to_add_mb: q.traffic_mb,
                note: 'Nothing charged. Re-run with estimate_only=false to top up.',
              }, null, 2),
            }],
          };
        }

        const data = await api.call<ResidentialAddTrafficResponse>('residential_add_traffic', {
          proxy_id,
          price_id,
          num,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
