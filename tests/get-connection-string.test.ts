import { describe, expect, it, vi } from 'vitest';
import { registerGetConnectionString } from '../src/tools/get-connection-string.js';
import { connect } from './helpers.js';

const MOBILE = {
  proxy_id: '10',
  proxy_type: 0,
  proxy_exp: '2026-12-01 10:00:00',
  proxy_geo: 'Russia, Moscow',
  proxy_hostname: 'gw.example.net',
  proxy_host_ip: '5.6.7.8',
  proxy_http_port: '8080',
  proxy_socks5_port: 8081,
  proxy_login: 'user1',
  proxy_pass: 'p@ss:1',
  proxy_change_ip_url: 'https://changeip.mobileproxy.space/?proxy_key=abc',
};
const RESIDENTIAL = {
  proxy_id: '20',
  proxy_type: 3,
  proxy_exp: '2026-12-01 10:00:00',
  proxy_geo: 'United States',
  proxy_hostname: 'residential.mobileproxy.space',
  proxy_host_ip: null,
  proxy_http_port: '2333',
  proxy_socks5_port: '2333',
  proxy_login: 'base',
  proxy_pass: 'pw',
};

function stubApi() {
  return {
    getMyProxy: vi.fn(async () => [MOBILE, RESIDENTIAL]),
    call: vi.fn(async (cmd: string) => {
      if (cmd === 'residential_settings') {
        return {
          status: 'ok',
          http: 'http://base-zone-custom-region-us:pw@residential.mobileproxy.space:2333',
          socks5: 'socks5://base-zone-custom-region-us:pw@residential.mobileproxy.space:2333',
        };
      }
      throw new Error(`unexpected ${cmd}`);
    }),
  };
}

const run = async (proxy_id: number) =>
  (await connect(registerGetConnectionString, stubApi()))('get_connection_string', { proxy_id });

describe('get_connection_string', () => {
  it('formats a mobile proxy, URL-encoding credentials only inside URLs', async () => {
    const r = await run(10);
    expect(r.json).toMatchObject({
      proxy_type: 'mobile',
      http_url: 'http://user1:p%40ss%3A1@gw.example.net:8080',
      socks5_url: 'socks5://user1:p%40ss%3A1@gw.example.net:8081',
      antidetect_import: 'gw.example.net:8080:user1:p@ss:1',
      change_ip_url: 'https://changeip.mobileproxy.space/?proxy_key=abc',
    });
    expect(r.json.curl_check).toContain('-x http://user1:p%40ss%3A1@gw.example.net:8080');
  });

  it('takes residential credentials from the current geo settings', async () => {
    const r = await run(20);
    expect(r.json).toMatchObject({
      proxy_type: 'residential',
      antidetect_import: 'residential.mobileproxy.space:2333:base-zone-custom-region-us:pw',
      fields: { http_port: 2333, socks5_port: 2333, login: 'base-zone-custom-region-us' },
    });
    expect(r.json.change_ip_url).toBeUndefined();
  });

  it('rejects an unknown proxy', async () => {
    const r = await run(99);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('not found');
  });
});
