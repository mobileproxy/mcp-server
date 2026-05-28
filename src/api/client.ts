import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';
import { TtlCache } from '../cache.js';
import { MobileProxyAPIError } from './errors.js';
import type { ChangeIpResponse, GetMyProxyResponse, Proxy } from './types.js';

export interface ApiClientConfig {
  apiKey: string;
  apiBase: string;
  timeoutMs: number;
}

const CHANGEIP_HOST = 'changeip.mobileproxy.space';

export class MobileProxyAPI {
  private proxyKeyCache = new TtlCache<number, string>(60_000 * 10); /* 10min */
  private proxyListCache = new TtlCache<string, GetMyProxyResponse>(15_000); /* short — for bursty agent calls */

  constructor(private config: ApiClientConfig) {}

  async call<T = unknown>(
    command: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    const url = new URL('/api.html', this.config.apiBase);
    url.searchParams.set('command', command);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    log.debug('API call', command, params);

    return retry(
      async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
        try {
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Accept-Language': 'en',
              'User-Agent': '@mobileproxy/mcp-server',
            },
            signal: ctrl.signal,
          });

          let data: { status?: string; message?: string } & Record<string, unknown>;
          try {
            data = (await res.json()) as typeof data;
          } catch {
            throw new MobileProxyAPIError(
              `Non-JSON response (HTTP ${res.status})`,
              null,
              res.status,
            );
          }

          if (!res.ok && data.status !== 'ok') {
            throw new MobileProxyAPIError(
              data.message ?? `HTTP ${res.status}`,
              data,
              res.status,
            );
          }
          if (data.status !== 'ok') {
            throw new MobileProxyAPIError(
              data.message ?? 'API returned status=err',
              data,
              res.status,
            );
          }

          return data as T;
        } finally {
          clearTimeout(timer);
        }
      },
      { retries: 3, baseMs: 1000, retryOn: isRetryable },
    );
  }

  /**
   * Get proxy_key for a given proxy_id. Uses an in-memory cache to avoid
   * re-fetching the whole list on every rotate_ip call.
   */
  async getProxyKey(proxyId: number): Promise<string | null> {
    const cached = this.proxyKeyCache.get(proxyId);
    if (cached) return cached;

    const list = await this.getMyProxy({ refresh: false });
    let found: string | null = null;
    for (const p of list.proxy_list ?? []) {
      if (p.proxy_key) this.proxyKeyCache.set(p.proxy_id, p.proxy_key);
      if (p.proxy_id === proxyId && p.proxy_key) found = p.proxy_key;
    }
    return found;
  }

  /**
   * Cached wrapper around get_my_proxy. Pass {refresh: true} to bust the cache
   * (e.g. immediately after buy_proxy).
   */
  async getMyProxy(opts: { refresh?: boolean; type?: number } = {}): Promise<GetMyProxyResponse> {
    const key = opts.type === undefined ? 'all' : `type=${opts.type}`;
    if (opts.refresh) this.proxyListCache.delete(key);
    const cached = this.proxyListCache.get(key);
    if (cached) return cached;

    const params: Record<string, number> = {};
    if (opts.type !== undefined) params.type = opts.type;
    const data = await this.call<GetMyProxyResponse>('get_my_proxy', params);
    this.proxyListCache.set(key, data);
    return data;
  }

  /**
   * IP rotation goes through a separate domain and skips Bearer auth — the
   * proxy_key itself is the credential.
   */
  async rotateIp(proxyKey: string): Promise<ChangeIpResponse> {
    const url = `https://${CHANGEIP_HOST}/?proxy_key=${encodeURIComponent(proxyKey)}&format=json`;
    log.debug('rotateIp', url);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = (await res.json()) as ChangeIpResponse;
      if (data.status !== 'ok') {
        throw new MobileProxyAPIError(
          data.message ?? 'IP rotation failed',
          data,
          res.status,
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof MobileProxyAPIError) {
    if (err.httpStatus && err.httpStatus >= 500) return true;
    if (err.httpStatus === 429) return true;
    return /too many requests|timeout/i.test(err.message);
  }
  if (err instanceof Error && err.name === 'AbortError') return true;
  return err instanceof Error; /* network errors */
}

export type { Proxy };
