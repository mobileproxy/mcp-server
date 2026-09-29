import { describe, expect, it, vi } from 'vitest';
import { registerFindAvailableGeo } from '../src/tools/find-available-geo.js';
import { connect } from './helpers.js';

const GEO = [
  { geoid: '10', geo_caption: 'Russia, Kazan', count_free: '3', iso: 'RU', id_city: '5' },
  { geoid: '11', geo_caption: 'Russia, Kazan #2', count_free: '0', iso: 'RU', id_city: '5' },
  { geoid: '12', geo_caption: 'Russia, Moscow', count_free: '10', iso: 'RU', id_city: '1' },
  { geoid: '13', geo_caption: 'Turkey, Istanbul', count_free: '5', iso: 'TR', id_city: '9' },
];
const OPERATORS: Record<string, unknown[]> = {
  '10': [{ operator: 'megafone', count_free: '2', id_country: '1' }, { operator: 'mts', count_free: '0', id_country: '1' }],
  '12': [{ operator: 'beeline', count_free: '10', id_country: '1' }],
};

function stubApi(country: number | null = 1) {
  const call = vi.fn(async (cmd: string, params: Record<string, unknown> = {}) => {
    if (cmd === 'get_operators_list') return OPERATORS[String(params.geoid)] ?? [];
    if (cmd === 'get_price') {
      return {
        status: 'ok',
        price: [
          { id_country: '1', iso: 'RU', amount: '990', country_name: 'Russia', period: '7', type: 0 },
          { id_country: '1', iso: 'RU', amount: '490', country_name: 'Russia', period: '1', type: 0 },
          { id_country: '1', iso: 'RU', amount: '300', country_name: 'Russia', period: '1', type: 1 },
        ],
      };
    }
    throw new Error(`unexpected ${cmd}`);
  });
  return {
    call,
    getGeoList: vi.fn(async () => GEO),
    resolveCountryId: vi.fn(async () => country),
  };
}

const run = async (api: Record<string, unknown>, args: Record<string, unknown>) =>
  (await connect(registerFindAvailableGeo, api))('find_available_geo', args);

describe('find_available_geo', () => {
  it('filters by city and free modems, with operators that have free modems', async () => {
    const r = await run(stubApi(), { country: 'ru', city: 'kazan' });
    expect(r.json.locations).toEqual([
      { geoid: 10, location: 'Russia, Kazan', free_modems: 3, operators: [{ operator: 'megafone', free_modems: 2 }] },
    ]);
    expect(r.json.matching_locations).toBe(1);
  });

  it('keeps only locations where the requested operator has free modems', async () => {
    const r = await run(stubApi(), { country: 'RU', operator: 'bee' });
    expect(r.json.locations.map((l: { geoid: number }) => l.geoid)).toEqual([12]);
  });

  it('sorts by free modems and quotes mobile prices by period', async () => {
    const r = await run(stubApi(), { country: 'RU' });
    expect(r.json.locations.map((l: { geoid: number }) => l.geoid)).toEqual([12, 10]);
    expect(r.json.prices.per_period).toEqual([
      { period_days: 1, amount: 490 },
      { period_days: 7, amount: 990 },
    ]);
  });

  it('rejects an unknown country', async () => {
    const r = await run(stubApi(null), { country: 'XX' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('not recognized');
  });
});
