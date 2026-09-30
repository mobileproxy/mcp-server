import { describe, expect, it, vi } from 'vitest';
import {
  registerRenewProxies,
  registerUpdateProxySettings,
  registerChangeProxyCredentials,
  registerRebootModem,
} from '../src/tools/proxy-management.js';
import { registerAccountHistory } from '../src/tools/account-history.js';
import { connect } from './helpers.js';

function stubApi(roster: unknown[] = []) {
  return {
    call: vi.fn(async (cmd: string, params: Record<string, unknown> = {}) => {
      switch (cmd) {
        case 'buyproxy':
          return params.amount_only ? { status: 'ok', amount: 1980 } : { status: 'ok', proxy_id: [1, 2], amount: 1980, message: 'renewed', proxy_data: {} };
        case 'edit_proxy':
          return { status: 'ok', proxy_id: { '1': '1', '2': '2' }, message: '' };
        case 'change_proxy_login_password':
          return { status: 'ok', proxy_id: '1', proxy_login: 'newlogin', proxy_pass: 'newpass123' };
        case 'reboot_proxy':
          return { status: 'ok', message: 'Rebooting #1' };
        case 'get_history':
          return { status: 'ok', history: [{ date: '2026-09-29 10:00:00', sum: '-990.00', comment: 'Proxy renewal; PID:1', hold: '0', ofd_url: 'https://ofd.example/r/1' }] };
        default:
          throw new Error(`unexpected ${cmd}`);
      }
    }),
    getMyProxy: vi.fn(async () => roster),
    invalidateProxyCaches: vi.fn(),
  };
}

describe('renew_proxies', () => {
  it('renews a list of proxies once, without retries', async () => {
    const api = stubApi();
    const r = await (await connect((s, a) => registerRenewProxies(s, a), api))('renew_proxies', { proxy_ids: [1, 2], period_days: 30 });
    expect(api.call).toHaveBeenCalledWith('buyproxy', { proxy_id: '1,2', period: 30 }, { retries: 0 });
    expect(r.json).toMatchObject({ status: 'ok', amount: 1980 });
    expect(api.invalidateProxyCaches).toHaveBeenCalled();
  });

  it('estimates without charging', async () => {
    const api = stubApi();
    const r = await (await connect((s, a) => registerRenewProxies(s, a), api))('renew_proxies', { proxy_ids: [1], period_days: 7, estimate_only: true });
    expect(api.call).toHaveBeenCalledWith('buyproxy', { proxy_id: '1', period: 7, amount_only: 1 }, { retries: 0 });
    expect(r.json).toMatchObject({ estimate_only: true, amount: 1980 });
  });

  it('rejects periods the backend does not sell', async () => {
    const r = await (await connect((s, a) => registerRenewProxies(s, a), stubApi()))('renew_proxies', { proxy_ids: [1], period_days: 5 });
    expect(r.isError).toBe(true);
  });

  it('only quotes when purchases are off, with a dashboard link', async () => {
    const api = stubApi();
    const call = await connect((s, a) => registerRenewProxies(s, a, { purchases: false }), api);
    const r = await call('quote_renewal', { proxy_ids: [1, 2], period_days: 30 });
    expect(api.call).toHaveBeenCalledWith('buyproxy', { proxy_id: '1,2', period: 30, amount_only: 1 });
    expect(r.json).toMatchObject({ quote_only: true, amount: 1980, checkout_url: expect.stringContaining('mobileproxy.space/user.html') });
  });
});

describe('update_proxy_settings', () => {
  it('maps only the settings that were passed', async () => {
    const api = stubApi();
    const r = await (await connect(registerUpdateProxySettings, api))('update_proxy_settings', { proxy_ids: [1, 2, 3], auto_renewal: false, auto_rotate_minutes: 15 });
    expect(api.call).toHaveBeenCalledWith('edit_proxy', { proxy_id: '1,2,3', proxy_auto_renewal: 0, proxy_reboot_time: 15 }, { retries: 0 });
    expect(r.json).toMatchObject({ updated: [1, 2], not_found: [3], changed: { auto_renewal: false, auto_rotate_minutes: 15 } });
  });

  it('needs at least one setting and a valid rotation timer', async () => {
    const call = await connect(registerUpdateProxySettings, stubApi());
    expect((await call('update_proxy_settings', { proxy_ids: [1] })).text).toContain('at least one');
    expect((await call('update_proxy_settings', { proxy_ids: [1], auto_rotate_minutes: 1 })).isError).toBe(true);
    expect((await call('update_proxy_settings', { proxy_ids: [1], auto_rotate_minutes: 0 })).isError).toBe(false);
  });
});

describe('change_proxy_credentials', () => {
  it('reads the new pair of every proxy back from the roster', async () => {
    const api = stubApi([
      { proxy_id: '1', proxy_login: 'newlogin', proxy_pass: 'newpass123' },
      { proxy_id: '2', proxy_login: 'newlogin', proxy_pass: 'newpass123' },
    ]);
    const r = await (await connect(registerChangeProxyCredentials, api))('change_proxy_credentials', { proxy_ids: [1, 2, 9] });
    expect(api.call).toHaveBeenCalledWith('change_proxy_login_password', { proxy_id: '1,2,9' }, { retries: 0 });
    expect(api.getMyProxy).toHaveBeenCalledWith({ refresh: true });
    expect(r.json.proxies).toEqual([
      { proxy_id: 1, login: 'newlogin', password: 'newpass123' },
      { proxy_id: 2, login: 'newlogin', password: 'newpass123' },
      { proxy_id: 9, error: 'not found in your account' },
    ]);
  });

  it('rejects credentials the backend would silently strip', async () => {
    const call = await connect(registerChangeProxyCredentials, stubApi());
    expect((await call('change_proxy_credentials', { proxy_ids: [1], password: 'short' })).isError).toBe(true);
    expect((await call('change_proxy_credentials', { proxy_ids: [1], login: 'bad-login!' })).isError).toBe(true);
  });
});

describe('reboot_modem and get_account_history', () => {
  it('reboots one modem without retries', async () => {
    const api = stubApi();
    const r = await (await connect(registerRebootModem, api))('reboot_modem', { proxy_id: 1 });
    expect(api.call).toHaveBeenCalledWith('reboot_proxy', { proxy_id: 1 }, { retries: 0 });
    expect(r.json).toMatchObject({ proxy_id: 1, status: 'rebooting' });
  });

  it('pages the history and normalises amounts and receipts', async () => {
    const api = stubApi();
    const r = await (await connect(registerAccountHistory, api))('get_account_history', { limit: 10, offset: 20 });
    expect(api.call).toHaveBeenCalledWith('get_history', { length: 10, start: 20 });
    expect(r.json.operations).toEqual([
      { date: '2026-09-29 10:00:00', amount: -990, description: 'Proxy renewal; PID:1', receipt_url: 'https://ofd.example/r/1' },
    ]);
  });
});
