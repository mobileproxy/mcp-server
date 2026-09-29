import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { PROXY_TYPE_NAMES, type ResidentialSettingsResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface Endpoint {
  host: string;
  httpPort: string;
  socks5Port: string;
  login: string;
  pass: string;
}

export function formatConnection(e: Endpoint) {
  const auth = `${encodeURIComponent(e.login)}:${encodeURIComponent(e.pass)}`;
  const http = `http://${auth}@${e.host}:${e.httpPort}`;
  return {
    http_url: http,
    socks5_url: `socks5://${auth}@${e.host}:${e.socks5Port}`,
    antidetect_import: `${e.host}:${e.httpPort}:${e.login}:${e.pass}`,
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
        'Returns a proxy\'s credentials as ready-to-paste strings: http:// and socks5:// URLs, ' +
        'a host:port:login:password line for bulk import into anti-detect browsers ' +
        '(AdsPower, Dolphin Anty, Multilogin, GoLogin), a curl command to test it, and for ' +
        'mobile proxies the change-IP link that anti-detect browsers accept in their ' +
        '"change IP URL" field. Use it whenever the user wants to plug a proxy into a ' +
        'browser profile, script or tool. For residential proxies the strings reflect the ' +
        'current geo settings; call again after set_residential_geo.',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('proxy_id from list_proxies'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ proxy_id }) => {
      try {
        const list = await api.getMyProxy();
        const p = list.find((x) => String(x.proxy_id) === String(proxy_id));
        if (!p) {
          throw new McpError(ErrorCode.InvalidParams, `Proxy ${proxy_id} not found in your account. Use list_proxies.`);
        }
        const type = Number(p.proxy_type);

        let endpoint: Endpoint;
        if (type === 3) {
          /* Geo targeting lives in the provider login, so the settings endpoint is the source of truth. */
          const s = await api.call<ResidentialSettingsResponse>('residential_settings', { proxy_id });
          const u = new URL(s.http);
          endpoint = {
            host: u.hostname,
            httpPort: u.port,
            socks5Port: u.port,
            login: decodeURIComponent(u.username),
            pass: decodeURIComponent(u.password),
          };
        } else {
          endpoint = {
            host: p.proxy_hostname || String(p.proxy_host_ip ?? ''),
            httpPort: String(p.proxy_http_port),
            socks5Port: String(p.proxy_socks5_port),
            login: p.proxy_login,
            pass: p.proxy_pass,
          };
        }

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
