import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAttachProxyToAdsPower } from '../src/tools/attach-proxy-to-adspower.js';
import { connect } from './helpers.js';

const MOBILE = {
  proxy_id: '10',
  proxy_type: 0,
  proxy_hostname: 'gw.example.net',
  proxy_http_port: '8080',
  proxy_socks5_port: 8081,
  proxy_login: 'user1',
  proxy_pass: 'secret',
  proxy_change_ip_url: 'https://changeip.mobileproxy.space/?proxy_key=abc',
};
const RESIDENTIAL = { proxy_id: '20', proxy_type: 3, proxy_hostname: 'residential.mobileproxy.space', proxy_http_port: '2333', proxy_socks5_port: '2333' };

const api = {
  getMyProxy: vi.fn(async () => [MOBILE, RESIDENTIAL]),
  call: vi.fn(async () => ({ http: 'http://base-zone-custom-region-us:pw@residential.mobileproxy.space:2333' })),
};

function stubFetch(response: unknown | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const run = async (args: Record<string, unknown>, apiKey?: string) =>
  (await connect((s, a) => registerAttachProxyToAdsPower(s, a, { baseUrl: 'http://local.adspower.net:50325', apiKey, timeoutMs: 1000 }), api))(
    'attach_proxy_to_adspower',
    args,
  );

afterEach(() => vi.unstubAllGlobals());

describe('attach_proxy_to_adspower', () => {
  it('sends a mobile proxy with its change-IP link to the profile', async () => {
    const fetchMock = stubFetch({ code: 0, msg: 'Success', data: {} });
    const r = await run({ proxy_id: 10, profile_id: 'jc8y5g3' }, 'ads-key');

    expect(r.json).toMatchObject({ status: 'updated', profile_id: 'jc8y5g3', protocol: 'http', port: 8080, change_ip_url_set: true });
    expect(r.text).not.toContain('secret');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://local.adspower.net:50325/api/v1/user/update');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ads-key');
    expect(JSON.parse(String(init.body))).toEqual({
      user_id: 'jc8y5g3',
      user_proxy_config: {
        proxy_soft: 'other',
        proxy_type: 'http',
        proxy_host: 'gw.example.net',
        proxy_port: '8080',
        proxy_user: 'user1',
        proxy_password: 'secret',
        proxy_url: 'https://changeip.mobileproxy.space/?proxy_key=abc',
      },
    });
  });

  it('uses the SOCKS5 port and residential geo login, without a change-IP link', async () => {
    const fetchMock = stubFetch({ code: 0, msg: 'Success' });
    await run({ proxy_id: 20, profile_id: 'p2', protocol: 'socks5' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.user_proxy_config).toMatchObject({ proxy_type: 'socks5', proxy_port: '2333', proxy_user: 'base-zone-custom-region-us' });
    expect(body.user_proxy_config.proxy_url).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('passes AdsPower rejections through', async () => {
    stubFetch({ code: -1, msg: 'Profile does not exist' });
    const r = await run({ proxy_id: 10, profile_id: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('AdsPower rejected the update: Profile does not exist');
  });

  it('explains how to fix an unreachable AdsPower', async () => {
    stubFetch(new TypeError('fetch failed'));
    const r = await run({ proxy_id: 10, profile_id: 'p1' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Open AdsPower on this computer and enable its Local API');
  });
});
