import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ResidentialSettingsResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

/**
 * Changing geo/session rewrites the provider login (…-zone-custom-region-us-st-georgia…),
 * so the connection string changes and the caller must re-read it — that is why the
 * tool returns http/socks5 back. Free of charge and reversible, hence not destructive.
 *
 * Sticky session names are generated server-side: the name is part of the provider
 * login, so a client-supplied value is not accepted.
 */
export function registerResidentialGeo(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'set_residential_geo',
    {
      title: 'Set residential geo and session mode',
      description:
        'Reads or changes the geo targeting and session mode of a residential proxy. With only ' +
        'proxy_id it returns the current settings; any other parameter changes them. Free and ' +
        'reversible. Geo codes come from get_residential_locations; the backend ignores unknown ' +
        'codes and keeps the previous location. A change rewrites the provider login, and the ' +
        'response carries the updated http/socks5 connection strings. session_mode="rotating" ' +
        'gives a new IP per request; "sticky" holds one IP for session_time minutes (max 120).',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('Residential proxy id'),
        country: z.string().length(2).optional().describe('ISO2 code from get_residential_locations'),
        state: z.string().optional().describe('Region code (requires country)'),
        city: z.string().optional().describe('City code (requires state)'),
        asn: z.string().optional().describe('ASN code, e.g. "AS7922"'),
        session_mode: z.enum(['rotating', 'sticky']).optional(),
        session_time: z.number().int().min(1).max(120).optional()
          .describe('Sticky session lifetime in minutes, 1-120 (only with session_mode="sticky")'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ proxy_id, country, state, city, asn, session_mode, session_time }) => {
      try {
        const params: Record<string, string | number> = { proxy_id };
        if (country !== undefined) params.country = country.toUpperCase();
        if (state !== undefined) params.state = state.toLowerCase();
        if (city !== undefined) params.city = city.toLowerCase();
        if (asn !== undefined) params.asn = asn;
        if (session_mode !== undefined) params.session_mode = session_mode;
        if (session_time !== undefined) params.session_time = session_time;

        const data = await api.call<ResidentialSettingsResponse>('residential_settings', params);
        const wrote = Object.keys(params).length > 1;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: wrote ? 'updated' : 'current', ...data }, null, 2),
          }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
