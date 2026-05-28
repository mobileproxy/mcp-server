import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { BuyProxyResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * NOTE: this tool charges the user's real balance. The MCP annotations mark it
 * destructive + non-idempotent so the calling agent (Claude Desktop, etc.) is
 * supposed to prompt for confirmation before invoking. We also expose
 * estimate_only as a built-in dry-run path — agents should use it first.
 */
const PROXY_TYPE_MAP = { mobile: 0, server: 1, backconnect: 2 } as const;
const ALLOWED_PERIODS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

export function registerBuyProxy(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'buy_proxy',
    {
      title: 'Purchase a new mobile proxy',
      description:
        'Purchases one or more new mobile proxies and adds them to the account. ' +
        'Charges the balance IMMEDIATELY — REQUIRES explicit user confirmation. ' +
        'Always call get_balance + get_price first, and ideally do a dry-run with ' +
        'estimate_only=true to see the final amount. country accepts ISO code or ' +
        'numeric id_country; for geo-precise orders pass geoid from get_geo_list. ' +
        'period_days must be one of 1,3,7,14,30,60,90,180,365. Returns the new ' +
        'proxies with full connection details on success.',
      inputSchema: {
        country: z.string().length(2).optional()
          .describe('Target country as 2-letter ISO code (or use id_country / geoid)'),
        id_country: z.number().int().positive().optional()
          .describe('Target country as numeric id_country'),
        geoid: z.number().int().positive().optional()
          .describe('Specific geo from get_geo_list (most precise)'),
        operator: z.string().optional()
          .describe('Operator name (e.g. "megafone", "MTS")'),
        period_days: z.number().int().positive()
          .refine((v): v is (typeof ALLOWED_PERIODS)[number] => (ALLOWED_PERIODS as readonly number[]).includes(v), {
            message: 'period_days must be one of 1, 3, 7, 14, 30, 60, 90, 180, 365',
          })
          .describe('Proxy duration in days; one of 1, 3, 7, 14, 30, 60, 90, 180, 365'),
        count: z.number().int().min(1).max(50).default(1)
          .describe('How many proxies to buy (max 50 in one call)'),
        type: z.enum(['mobile', 'server', 'backconnect']).default('mobile'),
        auto_renewal: z.boolean().default(false),
        estimate_only: z.boolean().default(false)
          .describe('Dry-run: returns the total amount without charging or allocating'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ country, id_country, geoid, operator, period_days, count, type, auto_renewal, estimate_only }) => {
      try {
        if (!country && !id_country && !geoid) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Provide one of: country (ISO), id_country (numeric), or geoid.',
          );
        }

        const params: Record<string, string | number | boolean> = {
          period: period_days,
          num: count,
          type: PROXY_TYPE_MAP[type],
          auto_renewal: auto_renewal ? 1 : 0,
        };
        if (geoid !== undefined) params.geoid = geoid;
        if (id_country !== undefined) {
          params.id_country = id_country;
        } else if (country) {
          const resolved = await api.resolveCountryId(country);
          if (resolved === null) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Country "${country}" not recognized (use a 2-letter ISO code).`,
            );
          }
          params.id_country = resolved;
        }
        if (operator) {
          const resolved = await api.resolveOperatorName(operator);
          params.operator = resolved ?? operator;
        }
        if (estimate_only) params.amount_only = 1;

        const data = await api.call<BuyProxyResponse | { status: 'ok'; amount: number }>(
          'buyproxy',
          params,
        );

        if (!estimate_only) api.invalidateProxyCaches();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
