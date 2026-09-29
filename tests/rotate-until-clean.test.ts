import { describe, expect, it, vi } from 'vitest';
import { registerRotateUntilClean } from '../src/tools/rotate-until-clean.js';
import { MobileProxyAPIError } from '../src/api/errors.js';
import { connect } from './helpers.js';

function stubApi(checks: boolean[], opts: { rotateErr?: Error; key?: string | null } = {}) {
  let n = 0;
  const rotateIp = vi.fn(async () => {
    if (opts.rotateErr) throw opts.rotateErr;
    return { status: 'OK' };
  });
  const call = vi.fn(async () => {
    const listed = checks[Math.min(n, checks.length - 1)];
    const ip = `10.0.0.${++n}`;
    return { ip, status: 'OK', 'ipguardian.net': { ip, found: listed, sources: listed ? ['spamhaus'] : [] } };
  });
  const getProxyKey = vi.fn(async () => (opts.key === undefined ? 'KEY' : opts.key));
  return { api: { getProxyKey, rotateIp, call }, rotateIp, call };
}

const setup = (api: Record<string, unknown>) =>
  connect((s, a) => registerRotateUntilClean(s, a, { verifyDelayMs: 0 }), api);

describe('rotate_until_clean', () => {
  it('stops at the first clean IP', async () => {
    const { api, rotateIp } = stubApi([false]);
    const r = await (await setup(api))('rotate_until_clean', { proxy_id: 1 });
    expect(r.json).toMatchObject({ status: 'clean', rotations: 1, final_ip: '10.0.0.1' });
    expect(rotateIp).toHaveBeenCalledTimes(1);
  });

  it('keeps rotating while the IP is blacklisted', async () => {
    const { api } = stubApi([true, false]);
    const r = await (await setup(api))('rotate_until_clean', { proxy_id: 1 });
    expect(r.json).toMatchObject({ status: 'clean', rotations: 2, final_ip: '10.0.0.2' });
    expect(r.json.history).toEqual([
      { ip: '10.0.0.1', listed: true, listed_by: ['spamhaus'] },
      { ip: '10.0.0.2', listed: false, listed_by: [] },
    ]);
  });

  it('gives up after max_attempts', async () => {
    const { api, rotateIp } = stubApi([true, true, true]);
    const r = await (await setup(api))('rotate_until_clean', { proxy_id: 1, max_attempts: 2 });
    expect(r.json).toMatchObject({ status: 'still_listed', rotations: 2 });
    expect(rotateIp).toHaveBeenCalledTimes(2);
  });

  it('keeps a clean current IP when keep_if_clean is set', async () => {
    const { api, rotateIp } = stubApi([false]);
    const r = await (await setup(api))('rotate_until_clean', { proxy_id: 1, keep_if_clean: true });
    expect(r.json).toMatchObject({ status: 'clean', rotations: 0, kept_current_ip: true });
    expect(rotateIp).not.toHaveBeenCalled();
  });

  it('reports the carrier cooldown instead of failing', async () => {
    const { api } = stubApi([false], {
      rotateErr: new MobileProxyAPIError('IP rotation failed: Too early, wait 45 seconds', {}, 200),
    });
    const r = await (await setup(api))('rotate_until_clean', { proxy_id: 1 });
    expect(r.json).toMatchObject({ status: 'cooldown', wait_seconds: 45, rotations: 0 });
  });

  it('rejects proxies without a proxy_key', async () => {
    const { api } = stubApi([false], { key: null });
    const r = await (await setup(api))('rotate_until_clean', { proxy_id: 1 });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('not a mobile proxy');
  });
});
