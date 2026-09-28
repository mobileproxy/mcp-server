import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ResidentialCountriesResponse, ResidentialLocationsResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Geo targeting for residential is a CASCADE: country → region → city, plus ASN
 * as an independent axis. Codes are provider-specific and must be taken from
 * here verbatim — an invented value is silently dropped by the backend, and the
 * user would get a working proxy in the wrong location.
 */
export function registerResidentialLocations(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_residential_locations',
    {
      title: 'List residential geo targets',
      description:
        'Lists geo targets available for residential proxies: countries, regions ' +
        '(states), cities or ASNs (carriers). Codes returned here are the ONLY valid ' +
        'values for set_residential_geo — never invent them, an unknown value is ' +
        'silently ignored and the proxy stays in the previous location. ' +
        'Cascade: type="countries" → type="regions" with country → type="cities" ' +
        'with country + region. Cities require a region because large countries have thousands. ' +
        'Entries may carry title_ru (Russian name) — use it when talking to a Russian-speaking ' +
        'user, but always send `code` back to set_residential_geo. title_ru is absent for small ' +
        'towns, that is expected and not an error.',
      inputSchema: {
        type: z.enum(['countries', 'regions', 'cities', 'asns']).default('countries')
          .describe('What to list'),
        country: z.string().length(2).optional()
          .describe('ISO2 country code, required for regions/cities/asns (e.g. "US")'),
        region: z.string().optional()
          .describe('Region code from type="regions", required for cities (e.g. "georgia")'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ type, country, region }) => {
      try {
        if (type === 'countries') {
          const data = await api.call<ResidentialCountriesResponse>('residential_countries', {});
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ countries: data ?? [] }, null, 2),
            }],
          };
        }

        if (!country) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `country is required for type="${type}". Call type="countries" first.`,
          );
        }
        if (type === 'cities' && !region) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'region is required for type="cities". Call type="regions" first to get valid region codes.',
          );
        }

        const params: Record<string, string> = { type, country: country.toLowerCase() };
        if (region) params.region = region.toLowerCase();

        const data = await api.call<ResidentialLocationsResponse>('residential_locations', params);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ type, country, region: region ?? null, locations: data ?? [] }, null, 2),
          }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
