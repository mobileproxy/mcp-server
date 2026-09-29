import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { GetOperatorsListResponse, GetPriceResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { nameMatches } from '../utils/geo-match.js';

/* Each operator lookup is one API call; the per-token limit is ~3 req/sec. */
const MAX_OPERATOR_LOOKUPS = 5;

export function registerFindAvailableGeo(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'find_available_geo',
    {
      title: 'Find where mobile proxies are available',
      description:
        'Answers "where can I get a mobile proxy in <country/city> on <operator>, and what ' +
        'does it cost" in one call: locations with free modems, which operators have free ' +
        'modems there, and mobile proxy prices per rental period. Use it before buy_proxy or ' +
        'change_geo instead of combining get_geo_list, operator lookups and get_price. ' +
        'city and operator accept Latin or Cyrillic ("Kazan" or "Казань", "megafon" or ' +
        '"Мегафон") and match the start of a word in the location caption / operator name. ' +
        'Captions are mostly English but some come back in Russian; operator names are API ' +
        'ids such as "megafone", "beeline", "tele2", "mts". ' +
        'Pass the returned geoid (and operator) to buy_proxy or change_geo.',
      inputSchema: {
        country: z.string().length(2).describe('2-letter ISO country code (RU, US, TR, ...)'),
        city: z.string().optional().describe('City or district, Latin or Cyrillic, e.g. "Kazan", "Казань", "Moscow"'),
        operator: z.string().optional().describe('Operator name or its start, Latin or Cyrillic, e.g. "megafon", "МТС"'),
        min_free: z.number().int().min(1).default(1).describe('Minimum free modems at a location'),
        limit: z.number().int().min(1).max(50).default(10).describe('Maximum locations to return'),
        currency: z.enum(['RUB', 'USD']).default('RUB'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ country, city, operator, min_free, limit, currency }) => {
      try {
        const iso = country.toUpperCase();
        const idCountry = await api.resolveCountryId(iso);
        if (idCountry === null) {
          throw new McpError(ErrorCode.InvalidParams, `Country "${country}" not recognized (use a 2-letter ISO code).`);
        }

        const needle = city?.trim();
        const matches = (await api.getGeoList())
          .filter((g) => (g.iso ?? '').toUpperCase() === iso)
          .filter((g) => !needle || nameMatches(g.geo_caption, needle))
          .filter((g) => Number(g.count_free) >= min_free)
          .sort((a, b) => Number(b.count_free) - Number(a.count_free));

        /* Operator availability is per location and changes minute to minute, so it is
           fetched fresh (not through the name-resolution cache) for the top locations only. */
        const opNeedle = operator?.trim();
        const locations = [];
        for (const [i, g] of matches.entries()) {
          if (locations.length >= limit) break;
          const entry: Record<string, unknown> = {
            geoid: Number(g.geoid),
            location: g.geo_caption,
            free_modems: Number(g.count_free),
          };
          if (i < MAX_OPERATOR_LOOKUPS) {
            const raw = await api.call<unknown>('get_operators_list', { geoid: Number(g.geoid) });
            const ops = (Array.isArray(raw) ? (raw as GetOperatorsListResponse) : [])
              .filter((o) => Number(o.count_free) > 0)
              .map((o) => ({ operator: o.operator, free_modems: Number(o.count_free) }));
            if (opNeedle) {
              const hit = ops.filter((o) => nameMatches(o.operator, opNeedle));
              if (!hit.length) continue;
              entry.operators = hit;
            } else {
              entry.operators = ops;
            }
          } else if (opNeedle) {
            continue;
          }
          locations.push(entry);
        }

        const priceData = await api.call<GetPriceResponse>('get_price', { id_country: idCountry, currency: currency.toLowerCase() });
        const prices = (priceData.price ?? [])
          .filter((p) => p.type === undefined || Number(p.type) === 0)
          .map((p) => ({ period_days: Number(p.period), amount: Number(p.amount) }))
          .sort((a, b) => a.period_days - b.period_days);

        const out = {
          country: iso,
          filters: { city: city ?? null, operator: operator ?? null, min_free },
          matching_locations: matches.length,
          locations,
          ...(opNeedle && matches.length > MAX_OPERATOR_LOOKUPS
            ? { note: `Operator availability was checked for the ${MAX_OPERATOR_LOOKUPS} locations with the most free modems.` }
            : {}),
          prices: { currency, proxy_type: 'mobile', per_period: prices },
          next_step: 'buy_proxy with geoid (and operator), estimate_only=true first; or change_geo to move an existing proxy.',
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
