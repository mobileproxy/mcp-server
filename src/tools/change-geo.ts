import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ChangeEquipmentResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export function registerChangeGeo(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'change_geo',
    {
      title: 'Change proxy country / operator',
      description:
        'Swaps the underlying modem of a proxy to one in a different country and/or ' +
        'with a different mobile operator, WITHOUT buying a new proxy (the same ' +
        'proxy_id keeps its login/password — only the physical location changes). ' +
        'Pass at least one of: country (ISO code), id_country (numeric), geoid ' +
        '(from get_geo_list — most specific), or operator (name). Use ' +
        'check_after_change=true to have the server verify the new IP is live ' +
        'before returning (adds 1-10s). Subject to a per-proxy cooldown.',
      inputSchema: {
        proxy_id: z.number().int().positive()
          .describe('proxy_id from list_proxies'),
        country: z.string().length(2).optional()
          .describe('Target country as 2-letter ISO code'),
        id_country: z.number().int().positive().optional()
          .describe('Target country as numeric id_country (alternative to ISO)'),
        geoid: z.number().int().positive().optional()
          .describe('Target geo as geoid from get_geo_list — most specific'),
        operator: z.string().optional()
          .describe('Target operator name (e.g. "megafone", "MTS")'),
        check_after_change: z.boolean().default(true)
          .describe('Wait for the API to verify the new IP'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ proxy_id, country, id_country, geoid, operator, check_after_change }) => {
      try {
        if (!country && !id_country && !geoid && !operator) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'At least one of country, id_country, geoid or operator must be provided.',
          );
        }

        const params: Record<string, string | number | boolean> = { proxy_id };

        if (geoid !== undefined) {
          params.geoid = geoid;
        }
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
          params.operator = resolved ?? operator; /* let API reject if truly unknown */
        }
        if (check_after_change) params.check_after_change = 'true';

        const data = await api.call<ChangeEquipmentResponse>('change_equipment', params);

        /* change_equipment can return status:err if every targeted proxy failed.
           A mixed-result (some ok, some err) also lands as status:err — surface both. */
        api.invalidateProxyCaches();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
