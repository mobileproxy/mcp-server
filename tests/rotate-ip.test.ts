import { describe, expect, it, vi } from 'vitest';
import { registerRotateIp } from '../src/tools/rotate-ip.js';
import { MobileProxyAPIError } from '../src/api/errors.js';
import { connect } from './helpers.js';

const PROXIES = [
  { proxy_id: '10', proxy_type: 0, proxy_key: 'KEY10' },
  { proxy_id: '20', proxy_type: 3 },
];

function stubApi(residential: () => unknown) {
  return {
    getMyProxy: vi.fn(async () => PROXIES),
    getProxyKey: vi.fn(async (id: number) => (id === 10 ? 'KEY10' : null)),
    rotateIp: vi.fn(async () => ({ status: 'OK', new_ip: '5.5.5.5' })),
    call: vi.fn(async (cmd: string) => {
      if (cmd === 'residential_change_ip') return residential();
      if (cmd === 'proxy_ip') return { ip: '9.9.9.9', status: 'OK' };
      throw new Error(`unexpected ${cmd}`);
    }),
  };
}

const run = async (api: Record<string, unknown>, args: Record<string, unknown>) =>
  (await connect((s, a) => registerRotateIp(s, a, { verifyDelayMs: 0 }), api))('rotate_ip', args);

const backendError = (message: string, code: string) => () => {
  throw new MobileProxyAPIError(message, { status: 'err', message, code }, 200);
};

describe('rotate_ip', () => {
  it('rotates a mobile proxy through its proxy_key', async () => {
    const api = stubApi(() => ({}));
    const r = await run(api, { proxy_id: 10 });
    expect(r.json).toMatchObject({ proxy_type: 'mobile', new_ip: '5.5.5.5' });
    expect(api.rotateIp).toHaveBeenCalledWith('KEY10');
  });

  it('refreshes a sticky residential proxy through residential_change_ip without retries', async () => {
    const api = stubApi(() => ({ status: 'ok', proxy_id: '20', new_ip: '7.7.7.7', message: 'IP changed' }));
    const r = await run(api, { proxy_id: 20, verify: true });
    expect(r.json).toMatchObject({ proxy_type: 'residential', new_ip: '7.7.7.7', verified_ip: '9.9.9.9', match: false });
    expect(api.call).toHaveBeenCalledWith('residential_change_ip', { proxy_id: 20 }, { retries: 0 });
    expect(api.rotateIp).not.toHaveBeenCalled();
  });

  it('asks to call again when the provider returns the same IP', async () => {
    const api = stubApi(() => ({ status: 'ok', proxy_id: '20', new_ip: '7.7.7.7', message: 'same', code: 'same_ip' }));
    const r = await run(api, { proxy_id: 20 });
    expect(r.json.note).toContain('Call rotate_ip again');
  });

  it('explains that rotating-mode residential proxies need no rotation', async () => {
    const r = await run(stubApi(backendError('IP rotates on every request in rotating mode', 'rotating')), { proxy_id: 20 });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('switch it to sticky with set_residential_geo');
  });

  it('passes the refresh cooldown through instead of reporting the API rate limit', async () => {
    const r = await run(stubApi(backendError('Too many requests, try again in 30 seconds', 'too_often')), { proxy_id: 20 });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('try again in 30 seconds');
    expect(r.text).not.toContain('Rate limit exceeded');
  });

  it('rejects proxies that cannot rotate', async () => {
    const r = await run(stubApi(() => ({})), { proxy_id: 99 });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('cannot rotate');
  });
});
