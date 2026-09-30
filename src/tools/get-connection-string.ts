import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { PROXY_TYPE_NAMES, type Proxy, type ResidentialSettingsResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface Endpoint {
  host: string;
  httpPort: string;
  socks5Port: string;
  login: string;
  pass: string;
}

export interface ResolvedProxy {
  proxy: Proxy;
  type: number;
  endpoint: Endpoint;
}

/** Finds a proxy in the account and returns the credentials a client should connect with right now. */
export async function resolveEndpoint(api: MobileProxyAPI, proxyId: number): Promise<ResolvedProxy> {
  const list = await api.getMyProxy();
  const proxy = list.find((x) => String(x.proxy_id) === String(proxyId));
  if (!proxy) {
    throw new McpError(ErrorCode.InvalidParams, `Proxy ${proxyId} not found in your account. Use list_proxies.`);
  }
  const type = Number(proxy.proxy_type);

  if (type === 3) {
    /* Geo targeting lives in the provider login, so the settings endpoint is the source of truth. */
    const s = await api.call<ResidentialSettingsResponse>('residential_settings', { proxy_id: proxyId });
    const u = new URL(s.http);
    return {
      proxy,
      type,
      endpoint: {
        host: u.hostname,
        httpPort: u.port,
        socks5Port: u.port,
        login: decodeURIComponent(u.username),
        pass: decodeURIComponent(u.password),
      },
    };
  }

  return {
    proxy,
    type,
    endpoint: {
      host: proxy.proxy_hostname || String(proxy.proxy_host_ip ?? ''),
      httpPort: String(proxy.proxy_http_port),
      socks5Port: String(proxy.proxy_socks5_port),
      login: proxy.proxy_login,
      pass: proxy.proxy_pass,
    },
  };
}

export function formatConnection(e: Endpoint) {
  const auth = `${encodeURIComponent(e.login)}:${encodeURIComponent(e.pass)}`;
  const http = `http://${auth}@${e.host}:${e.httpPort}`;
  return {
    http_url: http,
    socks5_url: `socks5://${auth}@${e.host}:${e.socks5Port}`,
    import_line: `${e.host}:${e.httpPort}:${e.login}:${e.pass}`,
    curl_check: `curl -x ${http} https://api.ipify.org`,
    fields: { host: e.host, http_port: Number(e.httpPort), socks5_port: Number(e.socks5Port), login: e.login, password: e.pass },
  };
}

export function registerGetConnectionString(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_connection_string',
    {
      title: 'Get ready-to-paste connection strings',
      description:
        'Returns a proxy\'s credentials as ready-to-paste strings: http:// and socks5:// URLs, a ' +
        'host:port:login:password line that most proxy managers and browser-profile tools import, ' +
        'a curl command to test it, and for mobile proxies the change-IP link that such tools ' +
        'accept as a "change IP URL". For residential proxies the strings reflect the current geo ' +
        'settings, which set_residential_geo changes.',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('proxy_id from list_proxies'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ proxy_id }) => {
      try {
        const { proxy: p, type, endpoint } = await resolveEndpoint(api, proxy_id);
        const out: Record<string, unknown> = {
          proxy_id,
          proxy_type: PROXY_TYPE_NAMES[type] ?? String(type),
          geo: p.proxy_geo,
          expires: p.proxy_exp,
          ...formatConnection(endpoint),
        };
        if (p.proxy_change_ip_url) out.change_ip_url = p.proxy_change_ip_url;
        if (type === 3) out.note = 'One port serves both HTTP and SOCKS5.';

        return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
