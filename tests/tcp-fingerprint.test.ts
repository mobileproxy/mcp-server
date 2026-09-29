import { describe, expect, it, vi } from 'vitest';
import { registerTcpFingerprint } from '../src/tools/tcp-fingerprint.js';
import { connect } from './helpers.js';

function stubApi() {
  return {
    call: vi.fn(async (cmd: string, params: Record<string, unknown> = {}) => {
      switch (cmd) {
        case 'tcp_fp_profiles':
          return {
            status: 'ok',
            profiles: [
              { profile_id: 3, name: 'Windows 11', description: 'Desktop Windows', category: 'desktop', profile_json: { ttl: 128 } },
              { profile_id: 7, name: 'Android 14', description: 'Pixel', category: 'mobile', profile_json: { ttl: 64 } },
            ],
          };
        case 'tcp_fp_get':
          return { status: 'ok', proxy: [{ proxy_id: 1, profile_id: 3, name: 'Windows 11', profile_json: {} }], errors: { '2': 'residential proxies are not supported' } };
        case 'tcp_fp_apply':
          return { status: 'ok', profile_id: params.profile_id || null, applied: 1, requested: 2, skipped: 1, message: 'queued', errors: { '2': 'not supported' } };
        case 'tcp_fp_diagnose':
          return { status: 'ok', proxy_id: 1, observed: { ttl: 128 }, comparison: { summary: 'Matches' }, cached: false };
        default:
          throw new Error(`unexpected ${cmd}`);
      }
    }),
  };
}

const setup = async () => {
  const api = stubApi();
  return { api, call: await connect(registerTcpFingerprint, api) };
};

describe('TCP fingerprint tools', () => {
  it('lists profiles without the raw JSON unless asked', async () => {
    const { api, call } = await setup();
    const brief = await call('list_tcp_profiles', { category: 'desktop' });
    expect(api.call).toHaveBeenCalledWith('tcp_fp_profiles', { category: 'desktop' });
    expect(brief.json.profiles[0]).toEqual({ profile_id: 3, name: 'Windows 11', description: 'Desktop Windows', category: 'desktop' });

    const full = await call('list_tcp_profiles', { include_details: true });
    expect(full.json.profiles[0].profile_json).toEqual({ ttl: 128 });
  });

  it('reads current profiles for several proxies and reports skipped ones', async () => {
    const { api, call } = await setup();
    const r = await call('get_tcp_fingerprint', { proxy_ids: [1, 2] });
    expect(api.call).toHaveBeenCalledWith('tcp_fp_get', { proxy_id: '1,2' });
    expect(r.json.errors).toEqual({ '2': 'residential proxies are not supported' });
  });

  it('applies a profile once, without retries, and resets with profile_id 0', async () => {
    const { api, call } = await setup();
    const r = await call('set_tcp_fingerprint', { proxy_ids: [1, 2], profile_id: 3 });
    expect(api.call).toHaveBeenCalledWith('tcp_fp_apply', { proxy_id: '1,2', profile_id: 3 }, { retries: 0 });
    expect(r.json).toMatchObject({ applied: 1, skipped: 1, note: expect.stringContaining('up to a minute') });

    await call('set_tcp_fingerprint', { proxy_ids: [1], profile_id: 0 });
    expect(api.call).toHaveBeenLastCalledWith('tcp_fp_apply', { proxy_id: '1', profile_id: 0 }, { retries: 0 });
  });

  it('diagnoses with a long timeout and no retries', async () => {
    const { api, call } = await setup();
    const r = await call('diagnose_tcp_fingerprint', { proxy_id: 1 });
    expect(api.call).toHaveBeenCalledWith('tcp_fp_diagnose', { proxy_id: 1 }, { timeoutMs: 70_000, retries: 0 });
    expect(r.json).toMatchObject({ proxy_id: 1, comparison: { summary: 'Matches' } });
    expect(r.json.status).toBeUndefined();
  });
});
