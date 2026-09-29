/**
 * Minimal client for the AdsPower Local API (https://localapi-doc-en.adspower.com).
 * The API only listens on the machine where AdsPower runs, so this is useful in local
 * (stdio) mode only.
 */

export interface AdsPowerConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

export function adsPowerConfigFromEnv(): AdsPowerConfig {
  return {
    baseUrl: process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325',
    apiKey: process.env.ADSPOWER_API_KEY || undefined,
    timeoutMs: 15_000,
  };
}

/** user_proxy_config as documented for /api/v1/user/update. */
export interface AdsPowerProxyConfig {
  proxy_soft: 'other';
  proxy_type: 'http' | 'socks5';
  proxy_host: string;
  proxy_port: string;
  proxy_user: string;
  proxy_password: string;
  proxy_url?: string;
}

export class AdsPowerError extends Error {}

export async function updateProfileProxy(cfg: AdsPowerConfig, profileId: string, proxy: AdsPowerProxyConfig): Promise<void> {
  const url = new URL('/api/v1/user/update', cfg.baseUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ user_id: profileId, user_proxy_config: proxy }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch {
    throw new AdsPowerError(
      `Cannot reach AdsPower at ${cfg.baseUrl}. Open AdsPower on this computer and enable its Local API; ` +
        'set ADSPOWER_API_URL if it listens on another address.',
    );
  }
  const data = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
  if (!data || data.code !== 0) {
    throw new AdsPowerError(`AdsPower rejected the update: ${data?.msg ?? `HTTP ${res.status}`}`);
  }
}
