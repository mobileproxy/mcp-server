import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { TcpFpApplyResponse, TcpFpGetResponse, TcpFpProfilesResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

/**
 * TCP fingerprint masks the OS at the network layer (TTL, MSS, window, TCP option order) so
 * anti-fraud systems see the same OS as the browser profile. It complements browser
 * fingerprinting in anti-detect browsers. The backend only honours it for mobile and server
 * proxies; other types are rejected per proxy in `errors`.
 */

const proxyIds = z.array(z.number().int().positive()).min(1).max(50)
  .describe('proxy_id values from list_proxies (mobile or server proxies)');

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

export function registerTcpFingerprint(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'list_tcp_profiles',
    {
      title: 'List TCP fingerprint profiles',
      description:
        'Lists the TCP/IP fingerprint presets a mobile or server proxy can imitate at the network ' +
        'layer (Android, iPhone, Windows, macOS, Linux…). Anti-fraud systems compare this OS ' +
        'signature with the browser\'s: pick the profile that matches the anti-detect browser ' +
        'profile, then apply it with set_tcp_fingerprint.',
      inputSchema: {
        category: z.enum(['mobile', 'desktop', 'linux', 'custom']).optional().describe('Only this category'),
        include_details: z.boolean().default(false).describe('Also return the raw profile_json (TTL, MSS, window, options)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ category, include_details }) => {
      try {
        const data = await api.call<TcpFpProfilesResponse>('tcp_fp_profiles', category ? { category } : {});
        const profiles = (data.profiles ?? []).map((p) =>
          include_details ? p : { profile_id: p.profile_id, name: p.name, description: p.description, category: p.category },
        );
        return json({ count: profiles.length, profiles });
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.registerTool(
    'get_tcp_fingerprint',
    {
      title: 'Show the TCP fingerprint of proxies',
      description:
        'Shows which TCP fingerprint profile each proxy currently imitates (profile_id null = the ' +
        'device\'s own, unmasked). Mobile and server proxies only; anything else is listed in errors.',
      inputSchema: { proxy_ids: proxyIds },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ proxy_ids }) => {
      try {
        const data = await api.call<TcpFpGetResponse>('tcp_fp_get', { proxy_id: proxy_ids.join(',') });
        return json({ proxies: data.proxy ?? [], ...(data.errors ? { errors: data.errors } : {}) });
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.registerTool(
    'set_tcp_fingerprint',
    {
      title: 'Apply a TCP fingerprint profile',
      description:
        'Makes mobile or server proxies imitate a TCP fingerprint profile from list_tcp_profiles, ' +
        'so the network-level OS matches the anti-detect browser profile (e.g. a Windows browser ' +
        'profile on a Windows TCP profile). profile_id=0 restores the device\'s own fingerprint. ' +
        'Free and reversible. Delivery to the equipment is queued and takes up to a minute, so ' +
        'diagnose_tcp_fingerprint right after may still show the old values. Residential and ' +
        'backconnect proxies are rejected per proxy in errors.',
      inputSchema: {
        proxy_ids: proxyIds,
        profile_id: z.number().int().min(0).describe('profile_id from list_tcp_profiles; 0 = back to the native fingerprint'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ proxy_ids, profile_id }) => {
      try {
        const data = await api.call<TcpFpApplyResponse>(
          'tcp_fp_apply',
          { proxy_id: proxy_ids.join(','), profile_id },
          { retries: 0 },
        );
        return json({
          profile_id: data.profile_id,
          applied: data.applied,
          requested: data.requested,
          skipped: data.skipped,
          note: 'Delivery to the equipment is queued and takes up to a minute.',
          ...(data.errors ? { errors: data.errors } : {}),
        });
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.registerTool(
    'diagnose_tcp_fingerprint',
    {
      title: 'Check the TCP fingerprint a site sees',
      description:
        'Sends a real request through the proxy to fingerprinting endpoints and compares what they ' +
        'observe (TTL, window, MSS, window scale, option order, OS guess) with the applied profile. ' +
        'Use it to confirm set_tcp_fingerprint took effect or to explain an anti-fraud flag. ' +
        'Slow: up to ~45 seconds. Results are cached for 60 seconds per proxy. One proxy per call, ' +
        'mobile or server only.',
      inputSchema: { proxy_id: z.number().int().positive().describe('Mobile or server proxy_id from list_proxies') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ proxy_id }) => {
      try {
        /* The backend spends up to 45 s on this; a retry would only multiply the wait. */
        const data = await api.call<Record<string, unknown>>('tcp_fp_diagnose', { proxy_id }, { timeoutMs: 70_000, retries: 0 });
        const { status: _status, ...rest } = data;
        return json(rest);
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
