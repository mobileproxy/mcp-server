import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { BuyProxyResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CHECKOUT_URL } from '../links.js';

const PROXY_TYPE_MAP = { mobile: 0, server: 1, backconnect: 2 } as const;
const ALLOWED_PERIODS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

const orderInput = {
  country: z.string().length(2).optional()
    .describe('Target country as 2-letter ISO code (or use id_country / geoid)'),
  id_country: z.number().int().positive().optional()
    .describe('Target country as numeric id_country'),
  geoid: z.number().int().positive().optional()
    .describe('Specific location from get_geo_list (most precise)'),
  operator: z.string().optional()
    .describe('Operator name (e.g. "megafone", "MTS")'),
  period_days: z.number().int().positive()
    .refine((v): v is (typeof ALLOWED_PERIODS)[number] => (ALLOWED_PERIODS as readonly number[]).includes(v), {
      message: 'period_days must be one of 1, 3, 7, 14, 30, 60, 90, 180, 365',
    })
    .describe('Rental period in days; one of 1, 3, 7, 14, 30, 60, 90, 180, 365'),
  count: z.number().int().min(1).max(50).default(1)
    .describe('How many proxies (max 50 in one call)'),
  type: z.enum(['mobile', 'server', 'backconnect']).default('mobile'),
};

interface Order {
  country?: string;
  id_country?: number;
  geoid?: number;
  operator?: string;
  period_days: number;
  count: number;
  type: keyof typeof PROXY_TYPE_MAP;
}

async function orderParams(api: MobileProxyAPI, o: Order): Promise<Record<string, string | number>> {
  if (!o.country && !o.id_country && !o.geoid) {
    throw new McpError(ErrorCode.InvalidParams, 'Provide one of: country (ISO), id_country (numeric), or geoid.');
  }
  const params: Record<string, string | number> = { period: o.period_days, num: o.count, type: PROXY_TYPE_MAP[o.type] };
  if (o.geoid !== undefined) params.geoid = o.geoid;
  if (o.id_country !== undefined) {
    params.id_country = o.id_country;
  } else if (o.country) {
    const resolved = await api.resolveCountryId(o.country);
    if (resolved === null) {
      throw new McpError(ErrorCode.InvalidParams, `Country "${o.country}" not recognized (use a 2-letter ISO code).`);
    }
    params.id_country = resolved;
  }
  if (o.operator) params.operator = (await api.resolveOperatorName(o.operator)) ?? o.operator;
  return params;
}

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

/**
 * purchases=false (hosted endpoint) registers a quote-only tool instead: the Claude connector
 * directory does not accept connectors that execute financial transactions for users.
 */
export function registerBuyProxy(server: McpServer, api: MobileProxyAPI, opts: { purchases?: boolean } = {}): void {
  if (opts.purchases === false) {
    server.registerTool(
      'quote_proxy_purchase',
      {
        title: 'Quote a proxy purchase',
        description:
          'Calculates the price of mobile, server or backconnect proxies for a location, period and ' +
          'quantity without buying anything. The account owner completes purchases in the ' +
          'mobileproxy.space dashboard; the result includes that link. country accepts an ISO code ' +
          'or id_country; geoid from get_geo_list pins an exact location.',
        inputSchema: orderInput,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (o) => {
        try {
          const params = await orderParams(api, o);
          const data = await api.call<{ status: 'ok'; amount: number }>('buyproxy', { ...params, amount_only: 1 });
          return json({ quote_only: true, amount: data.amount, currency: 'RUB', order: o, checkout_url: CHECKOUT_URL });
        } catch (err) {
          throw toMcpError(err);
        }
      },
    );
    return;
  }

  server.registerTool(
    'buy_proxy',
    {
      title: 'Buy proxies',
      description:
        'Buys one or more mobile, server or backconnect proxies and charges the account balance ' +
        'immediately. With estimate_only=true it returns the total without charging or allocating. ' +
        'country accepts an ISO code or id_country; geoid from get_geo_list pins an exact location. ' +
        'Returns the new proxies with full connection details.',
      inputSchema: {
        ...orderInput,
        auto_renewal: z.boolean().default(false),
        estimate_only: z.boolean().default(false)
          .describe('Return the total amount without charging or allocating'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ auto_renewal, estimate_only, ...o }) => {
      try {
        const params: Record<string, string | number> = { ...(await orderParams(api, o)), auto_renewal: auto_renewal ? 1 : 0 };
        if (estimate_only) params.amount_only = 1;
        const data = await api.call<BuyProxyResponse | { status: 'ok'; amount: number }>('buyproxy', params, { retries: 0 });
        if (!estimate_only) api.invalidateProxyCaches();
        return json(data);
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
