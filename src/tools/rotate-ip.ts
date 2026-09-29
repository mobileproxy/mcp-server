import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { ProxyIpResponse, ResidentialChangeIpResponse } from '../api/types.js';
import { MobileProxyAPIError, toMcpError } from '../api/errors.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/* residential_change_ip error codes → what the agent should tell the user or do next. */
const RESIDENTIAL_HINTS: Record<string, string> = {
  rotating:
    'This residential proxy is in rotating mode, so every request already gets a new IP. ' +
    'To hold one IP and refresh it on demand, switch it to sticky with set_residential_geo.',
  unsupported: 'The residential provider behind this proxy does not support refreshing the IP.',
  expired: 'This residential proxy has expired. Renew it or top it up with add_residential_traffic.',
};

export function registerRotateIp(server: McpServer, api: MobileProxyAPI, opts: { verifyDelayMs?: number } = {}): void {
  const verifyDelayMs = opts.verifyDelayMs ?? 1500;

  server.registerTool(
    'rotate_ip',
    {
      title: 'Rotate proxy IP',
      description:
        'Gets a proxy a new exit IP. Mobile proxies (proxy_type=0) reconnect to the carrier and ' +
        'pick up a new cellular IP — THE core mobile-proxy feature, used between scraping ' +
        'requests, account creations, etc. Residential proxies (proxy_type=3) in sticky mode ' +
        'get a new peer; in rotating mode the IP already changes on every request, so there is ' +
        'nothing to rotate. Takes ~3-10 seconds and costs nothing. Set verify=true to check the ' +
        'new IP afterwards (adds ~1-2s). There is a short cooldown between rotations.',
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
        const proxy = (await api.getMyProxy()).find((p) => String(p.proxy_id) === String(proxy_id));
        const residential = Number(proxy?.proxy_type) === 3;

        let newIp: string | undefined;
        let note: string | undefined;
        if (residential) {
          let r: ResidentialChangeIpResponse;
          try {
            r = await api.call<ResidentialChangeIpResponse>('residential_change_ip', { proxy_id }, { retries: 0 });
          } catch (err) {
            const code = err instanceof MobileProxyAPIError ? (err.response as { code?: string } | null)?.code : undefined;
            const hint = code ? RESIDENTIAL_HINTS[code] : undefined;
            if (hint) throw new McpError(ErrorCode.InvalidRequest, hint);
            /* Cooldown between refreshes; the backend message carries the seconds to wait. It must
               not fall through to toMcpError, which would read it as the API rate limit. */
            if (code === 'too_often') throw new McpError(ErrorCode.InvalidRequest, (err as Error).message);
            throw err;
          }
          newIp = r.new_ip || undefined;
          if (r.code === 'same_ip') note = 'The provider returned the same IP this time. Call rotate_ip again.';
        } else {
          const proxyKey = await api.getProxyKey(proxy_id);
          if (!proxyKey) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Proxy ${proxy_id} not found in your account, or it cannot rotate (only mobile and ` +
                'residential proxies change IP). Use list_proxies to see available IDs.',
            );
          }
          newIp = (await api.rotateIp(proxyKey)).new_ip;
        }

        let verified: ProxyIpResponse | null = null;
        if (verify) {
          if (verifyDelayMs > 0) await new Promise((r) => setTimeout(r, verifyDelayMs));
          try {
            verified = await api.call<ProxyIpResponse>('proxy_ip', { proxy_id });
          } catch {
            /* Verification is best-effort */
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              proxy_id,
              proxy_type: residential ? 'residential' : 'mobile',
              new_ip: newIp ?? null,
              verified_ip: verified?.ip ?? null,
              match: verified && newIp ? verified.ip === newIp : null,
              ...(note ? { note } : {}),
            }, null, 2),
          }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
