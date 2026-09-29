import { describe, expect, it, vi } from 'vitest';
import { registerGetHealthSnapshot } from '../src/tools/get-health-snapshot.js';
import { connect, mskIn } from './helpers.js';

const proxy = (id: string, type: number, expHours: number, extra: Record<string, unknown> = {}) => ({
  proxy_id: id,
  proxy_type: type,
  proxy_exp: mskIn(expHours),
  proxy_auto_renewal: '0',
  ...extra,
});

function stubApi(proxies: unknown[], listedIds: string[] = []) {
  const call = vi.fn(async (cmd: string, params: Record<string, unknown> = {}) => {
    if (cmd === 'get_balance') return { status: 'ok', balance: '150.5' };
    if (cmd === 'proxy_ip') {
      const found = listedIds.includes(String(params.proxy_id));
      const sources = found
        ? [
            { type: 'direct', filename: 'firehol_abusers_30d.netset', category: 'abuse', maintainer: 'FireHOL' },
            { type: 'direct', filename: 'firehol_abusers_1d.netset', category: 'abuse', maintainer: 'FireHOL' },
            { type: 'direct', filename: 'stopforumspam_365d.ipset', category: 'abuse', maintainer: 'StopForumSpam.com' },
          ]
        : [];
      return { ip: '1.2.3.4', status: 'OK', 'ipguardian.net': { ip: '1.2.3.4', found, sources } };
    }
    throw new Error(`unexpected ${cmd}`);
  });
  return { api: { call, getMyProxy: vi.fn(async () => proxies) }, call };
}

const run = async (api: Record<string, unknown>, args: Record<string, unknown> = {}) =>
  (await connect(registerGetHealthSnapshot, api))('get_health_snapshot', args);

describe('get_health_snapshot', () => {
  it('flags expiry by auto-renewal state and ignores healthy proxies', async () => {
    const { api } = stubApi([
      proxy('1', 0, 24),
      proxy('2', 0, 24, { proxy_auto_renewal: '1' }),
      proxy('3', 0, 24 * 20),
      proxy('4', 1, -2),
    ]);
    const r = await run(api);
    const byId = Object.fromEntries(r.json.attention.map((i: { proxy_id: string }) => [i.proxy_id, i]));
    expect(byId['1']).toMatchObject({ severity: 'warning', issue: 'expires_soon' });
    expect(byId['2']).toMatchObject({ severity: 'info', issue: 'expires_soon' });
    expect(byId['3']).toBeUndefined();
    expect(byId['4']).toMatchObject({ severity: 'critical', issue: 'expired' });
    expect(r.json.attention[0].severity).toBe('critical');
    expect(r.json.balance_rub).toBe(150.5);
    expect(r.json.by_type).toEqual({ mobile: 3, server: 1 });
  });

  it('flags residential packages low on or out of traffic', async () => {
    const { api } = stubApi([
      proxy('5', 3, 24 * 20, { residential_traffic_limit_mb: '1000', residential_traffic_left_mb: '50' }),
      proxy('6', 3, 24 * 20, { residential_traffic_limit_mb: '1000', residential_traffic_left_mb: '0' }),
      proxy('7', 3, 24 * 20, { residential_traffic_limit_mb: '1000', residential_traffic_left_mb: '900' }),
    ]);
    const r = await run(api);
    expect(r.json.attention).toEqual([
      expect.objectContaining({ proxy_id: '6', severity: 'critical', issue: 'traffic_exhausted' }),
      expect.objectContaining({ proxy_id: '5', severity: 'warning', issue: 'low_traffic' }),
    ]);
  });

  it('checks blacklists only for live mobile/server proxies when asked', async () => {
    const { api, call } = stubApi(
      [proxy('8', 0, 24 * 20), proxy('9', 1, 24 * 20), proxy('10', 3, 24 * 20), proxy('11', 0, -1)],
      ['8', '9'],
    );
    const r = await run(api, { check_spam: true });
    expect(r.json.spam_check).toEqual({ checked: 2, skipped: 0 });
    expect(call.mock.calls.filter(([cmd]) => cmd === 'proxy_ip')).toHaveLength(2);

    const listed = Object.fromEntries(
      r.json.attention.filter((i: { issue: string }) => i.issue === 'blacklisted').map((i: { proxy_id: string; detail: string }) => [i.proxy_id, i.detail]),
    );
    expect(listed['8']).toBe('IP 1.2.3.4 is listed by FireHOL (abuse), StopForumSpam.com (abuse) — run rotate_until_clean');
    expect(listed['9']).toContain('static IP, rotation is not available');
  });

  it('skips blacklist lookups by default', async () => {
    const { api, call } = stubApi([proxy('8', 0, 24 * 20)]);
    const r = await run(api);
    expect(r.json.spam_check).toBeNull();
    expect(r.json.summary).toContain('nothing needs attention');
    expect(call.mock.calls.some(([cmd]) => cmd === 'proxy_ip')).toBe(false);
  });
});
