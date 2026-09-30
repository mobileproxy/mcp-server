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
import { CHECKOUT_URL, DASHBOARD_URL } from '../links.js';

/**
 * Both purchase tools charge the real balance. The backend guards against double-charging
 * with a short purchase lock: a parallel call returns "Another purchase is in progress".
 * purchases=false (hosted endpoint) registers quote-only tools, because the Claude connector
 * directory does not accept connectors that execute financial transactions for users.
 */

async function quote(api: MobileProxyAPI, price_id: number, num: number) {
  const plans = await api.call<ResidentialPlansResponse>('residential_plans', {});
  const plan = (plans ?? []).find((p) => Number(p.price_id) === price_id);
  if (!plan) {
    throw new McpError(ErrorCode.InvalidParams, `Plan ${price_id} not found. list_residential_plans shows valid price_id values.`);
  }
  return { plan, amount: Number(plan.sum) * num, traffic_mb: Number(plan.traffic_mb) * num };
}

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

const planInput = {
  price_id: z.number().int().positive().describe('Plan id from list_residential_plans'),
  num: z.number().int().min(1).max(100).default(1).describe('Plan multiplier: num=2 on a 10 GB plan means 20 GB'),
};

export function registerResidentialBuy(server: McpServer, api: MobileProxyAPI, opts: { purchases?: boolean } = {}): void {
  if (opts.purchases === false) {
    server.registerTool(
      'quote_residential_purchase',
      {
        title: 'Quote a residential traffic package',
        description:
          'Calculates the price and traffic volume of a residential proxy package from ' +
          'list_residential_plans without buying it. The account owner completes purchases in the ' +
          'mobileproxy.space dashboard; the result includes that link.',
        inputSchema: planInput,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ price_id, num }) => {
        try {
          const q = await quote(api, price_id, num);
          return json({ quote_only: true, plan: q.plan, num, amount: q.amount, traffic_mb: q.traffic_mb, checkout_url: CHECKOUT_URL });
        } catch (err) {
          throw toMcpError(err);
        }
      },
    );
    return;
  }

  server.registerTool(
    'buy_residential',
    {
      title: 'Buy a residential proxy package',
      description:
        'Buys a residential (home ISP) proxy: a traffic bundle rather than a time rental. Charges ' +
        'the account balance immediately; estimate_only=true returns the amount without charging. ' +
        'country is optional: without it the pool is global, and set_residential_geo can change it ' +
        'later for free.',
      inputSchema: {
        ...planInput,
        country: z.string().length(2).optional().describe('ISO2 country code; omit for a global pool'),
        estimate_only: z.boolean().default(false).describe('Return the amount without charging'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ price_id, num, country, estimate_only }) => {
      try {
        const q = await quote(api, price_id, num);
        if (estimate_only) {
          return json({ estimate_only: true, plan: q.plan, num, country: country ?? null, amount: q.amount, traffic_mb: q.traffic_mb, note: 'Nothing charged.' });
        }
        const params: Record<string, string | number> = { price_id, num };
        if (country) params.country = country.toUpperCase();
        const data = await api.call<ResidentialBuyResponse>('residential_buy', params, { retries: 0 });
        api.invalidateProxyCaches();
        return json(data);
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

export function registerResidentialAddTraffic(server: McpServer, api: MobileProxyAPI, opts: { purchases?: boolean } = {}): void {
  const input = { proxy_id: z.number().int().positive().describe('Existing residential proxy id'), ...planInput };

  if (opts.purchases === false) {
    server.registerTool(
      'quote_residential_topup',
      {
        title: 'Quote a residential traffic top-up',
        description:
          'Calculates the price of adding traffic to an existing residential proxy without buying it. ' +
          'The account owner completes the top-up in the mobileproxy.space dashboard; the result ' +
          'includes that link. The remaining quota is residential_traffic_left_mb in list_proxies.',
        inputSchema: input,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ proxy_id, price_id, num }) => {
        try {
          const q = await quote(api, price_id, num);
          return json({ quote_only: true, proxy_id, plan: q.plan, num, amount: q.amount, traffic_to_add_mb: q.traffic_mb, checkout_url: DASHBOARD_URL });
        } catch (err) {
          throw toMcpError(err);
        }
      },
    );
    return;
  }

  server.registerTool(
    'add_residential_traffic',
    {
      title: 'Add traffic to a residential proxy',
      description:
        'Tops up the traffic quota of an existing residential proxy, keeping its geo settings and ' +
        'connection string. Charges the account balance immediately; estimate_only=true returns the ' +
        'amount without charging. The remaining quota is residential_traffic_left_mb in list_proxies.',
      inputSchema: {
        ...input,
        estimate_only: z.boolean().default(false).describe('Return the amount without charging'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ proxy_id, price_id, num, estimate_only }) => {
      try {
        const q = await quote(api, price_id, num);
        if (estimate_only) {
          return json({ estimate_only: true, proxy_id, plan: q.plan, num, amount: q.amount, traffic_to_add_mb: q.traffic_mb, note: 'Nothing charged.' });
        }
        const data = await api.call<ResidentialAddTrafficResponse>('residential_add_traffic', { proxy_id, price_id, num }, { retries: 0 });
        api.invalidateProxyCaches();
        return json(data);
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
