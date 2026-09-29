import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { PROXY_TYPE_NAMES } from '../api/types.js';
import { toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AdsPowerError, adsPowerConfigFromEnv, updateProfileProxy, type AdsPowerConfig } from '../adspower.js';
import { resolveEndpoint } from './get-connection-string.js';

export function registerAttachProxyToAdsPower(
  server: McpServer,
  api: MobileProxyAPI,
  cfg: AdsPowerConfig = adsPowerConfigFromEnv(),
): void {
  server.registerTool(
    'attach_proxy_to_adspower',
    {
      title: 'Put a proxy into an AdsPower profile',
      description:
        'Writes a mobileproxy.space proxy into an AdsPower browser profile through the AdsPower ' +
        'Local API: host, port, login, password and, for mobile proxies, the change-IP link. ' +
        'It REPLACES the profile\'s current proxy settings, so confirm with the user first. ' +
        'Requires AdsPower running on this computer with its Local API enabled ' +
        '(ADSPOWER_API_KEY must be set if AdsPower security verification is on). profile_id is ' +
        'the AdsPower profile id (user_id). If the profile is open, restart it to apply.',
      inputSchema: {
        proxy_id: z.number().int().positive().describe('proxy_id from list_proxies'),
        profile_id: z.string().min(1).describe('AdsPower profile id (user_id)'),
        protocol: z.enum(['http', 'socks5']).default('http'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ proxy_id, profile_id, protocol }) => {
      try {
        const { proxy, type, endpoint } = await resolveEndpoint(api, proxy_id);
        const port = protocol === 'socks5' ? endpoint.socks5Port : endpoint.httpPort;
        const changeIpUrl = proxy.proxy_change_ip_url || undefined;

        await updateProfileProxy(cfg, profile_id, {
          proxy_soft: 'other',
          proxy_type: protocol,
          proxy_host: endpoint.host,
          proxy_port: port,
          proxy_user: endpoint.login,
          proxy_password: endpoint.pass,
          ...(changeIpUrl ? { proxy_url: changeIpUrl } : {}),
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'updated',
              profile_id,
              proxy_id,
              proxy_type: PROXY_TYPE_NAMES[type] ?? String(type),
              protocol,
              host: endpoint.host,
              port: Number(port),
              change_ip_url_set: Boolean(changeIpUrl),
              note: 'Restart the AdsPower profile if it is open so the new proxy takes effect.',
            }, null, 2),
          }],
        };
      } catch (err) {
        if (err instanceof AdsPowerError) throw new McpError(ErrorCode.InternalError, err.message);
        throw toMcpError(err);
      }
    },
  );
}
