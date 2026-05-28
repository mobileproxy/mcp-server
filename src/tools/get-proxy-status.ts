import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ProxyIpResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

export function registerGetProxyStatus(server: McpServer, api: MobileProxyAPI): void {
  server.tool(
    'get_proxy_status',
    'Returns the CURRENT external IP of a proxy and optionally checks if that ' +
      'IP is listed in spam/abuse blacklists (Spamhaus, Stop Forum Spam, etc). ' +
      'Use to verify a fresh rotation succeeded, or to decide if you need to ' +
      'rotate again because the IP is dirty. The check_spam=true mode is slower ' +
      '(~3s extra) but is the only way to assess IP quality.',
    {
      proxy_id: z.number().int().positive()
        .describe('proxy_id from list_proxies'),
      check_spam: z.boolean().default(false)
        .describe('Run spam-blacklist check (slower, ~3s extra)'),
    },
    async ({ proxy_id, check_spam }) => {
      try {
        const params: Record<string, string | number | boolean> = { proxy_id };
        if (check_spam) params.check_spam = 'true';
        const data = await api.call<ProxyIpResponse>('proxy_ip', params);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
