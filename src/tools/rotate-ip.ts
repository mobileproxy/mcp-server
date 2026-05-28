import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ProxyIpResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

export function registerRotateIp(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'rotate_ip',
    {
      title: 'Rotate proxy IP',
      description:
        'Forces the mobile proxy to acquire a new IP address from the carrier ' +
        '(changes the cellular session). This is THE core mobile-proxy feature — ' +
        'agents use it between scraping requests, account creations, etc. Takes ' +
        '~3-10 seconds and returns the new IP. Costs nothing — IP rotation is ' +
        'included in the subscription. Set verify=true to auto-check the new IP ' +
        'after rotation (adds ~1-2s). Only works on mobile proxies (proxy_type=0) — ' +
        'they are the only ones with a proxy_key.',
      inputSchema: {
        proxy_id: z.number().int().positive()
          .describe('proxy_id from list_proxies'),
        verify: z.boolean().default(false)
          .describe('Call proxy_ip after rotation to confirm the new IP'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ proxy_id, verify }) => {
      try {
        const proxyKey = await api.getProxyKey(proxy_id);
        if (!proxyKey) {
          throw new Error(
            `Proxy ${proxy_id} not found in your account, or it has no proxy_key ` +
              `(only mobile proxies support IP rotation). Use list_proxies to see available IDs.`,
          );
        }

        const result = await api.rotateIp(proxyKey);

        let verified: ProxyIpResponse | null = null;
        if (verify) {
          await sleep(1500);
          try {
            verified = await api.call<ProxyIpResponse>('proxy_ip', { proxy_id });
          } catch {
            /* Verification is best-effort */
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  proxy_id,
                  new_ip: result.new_ip,
                  verified_ip: verified?.ip ?? null,
                  match: verified ? verified.ip === result.new_ip : null,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
