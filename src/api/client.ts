import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';
import { TtlCache } from '../cache.js';
import { MobileProxyAPIError } from './errors.js';
import type {
  ChangeIpResponse,
  CountryEntry,
  GetGeoListResponse,
  GetIdCountryResponse,
  GetMyProxyResponse,
  GetOperatorsListResponse,
  OperatorEntry,
  Proxy,
} from './types.js';

export interface ApiClientConfig {
  apiKey: string;
  apiBase: string;
  timeoutMs: number;
}

const CHANGEIP_HOST = 'changeip.mobileproxy.space';

export class MobileProxyAPI {
  private proxyKeyCache = new TtlCache<string, string>(60_000 * 10); /* 10min, keyed by stringified proxy_id */
  private proxyListCache = new TtlCache<string, GetMyProxyResponse>(15_000); /* short — for bursty agent calls */
  private countryCache = new TtlCache<string, GetIdCountryResponse>(60 * 60_000); /* 1h, static-ish reference data */
  private geoListCache = new TtlCache<string, GetGeoListResponse>(5 * 60_000); /* 5min */
  private operatorsCache = new TtlCache<string, GetOperatorsListResponse>(60 * 60_000); /* 1h */

  constructor(private config: ApiClientConfig) {}

  /** Bust caches that depend on the user's proxy roster (call after buy/change). */
  invalidateProxyCaches(): void {
    this.proxyListCache.clear();
    this.proxyKeyCache.clear();
  }

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

          let data: unknown;
          try {
            data = await res.json();
          } catch {
            throw new MobileProxyAPIError(
              `Non-JSON response (HTTP ${res.status})`,
              null,
              res.status,
            );
          }

          /* Error detection: api.php only sets {status:'err', message:...} on failure;
             on success the shape is command-specific (array, plain object, or {status:'ok',...}).
             A `status` field in payload data (like proxy_ip's "OK"/"NULL IP") is NOT a signal. */
          if (isErrEnvelope(data)) {
            throw new MobileProxyAPIError(
              data.message ?? 'API returned status=err',
              data,
              res.status,
            );
          }

          if (!res.ok) {
            throw new MobileProxyAPIError(
              `HTTP ${res.status}`,
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
  async getProxyKey(proxyId: number | string): Promise<string | null> {
    const idStr = String(proxyId);
    const cached = this.proxyKeyCache.get(idStr);
    if (cached) return cached;

    const list = await this.getMyProxy({ refresh: false });
    let found: string | null = null;
    for (const p of list) {
      if (p.proxy_key) this.proxyKeyCache.set(String(p.proxy_id), p.proxy_key);
      if (String(p.proxy_id) === idStr && p.proxy_key) found = p.proxy_key;
    }
    return found;
  }

  /**
   * Cached wrapper around get_my_proxy. Returns a raw array (the API has no
   * envelope for this command). Pass {refresh: true} to bust the cache after
   * mutations (buy_proxy, change_equipment, etc.).
   */
  async getMyProxy(opts: { refresh?: boolean; type?: number } = {}): Promise<GetMyProxyResponse> {
    const key = opts.type === undefined ? 'all' : `type=${opts.type}`;
    if (opts.refresh) this.proxyListCache.delete(key);
    const cached = this.proxyListCache.get(key);
    if (cached) return cached;

    const params: Record<string, number> = {};
    if (opts.type !== undefined) params.type = opts.type;
    const raw = await this.call<unknown>('get_my_proxy', params);
    const arr: Proxy[] = Array.isArray(raw) ? (raw as Proxy[]) : [];
    this.proxyListCache.set(key, arr);
    return arr;
  }

  /**
   * Cached fetch of the country reference table. Always loaded with
   * only_avaliable=0 (full list) to keep the cache key simple — the
   * "available modems" flag is a property of geo lists, not countries.
   */
  async getCountries(): Promise<Record<string, CountryEntry>> {
    const cached = this.countryCache.get('all');
    if (cached) return cached.id_country;
    const data = await this.call<GetIdCountryResponse>('get_id_country');
    this.countryCache.set('all', data);
    return data.id_country;
  }

  /** Resolve an ISO 2-letter code (or numeric id) to the country's id_country. */
  async resolveCountryId(input: string | number): Promise<number | null> {
    if (typeof input === 'number' || /^\d+$/.test(String(input))) {
      return Number(input);
    }
    const iso = String(input).toUpperCase().trim();
    const countries = await this.getCountries();
    for (const c of Object.values(countries)) {
      if ((c.ISO ?? '').toUpperCase() === iso) return Number(c.id_country);
    }
    return null;
  }

  async getGeoList(opts: { geoid?: number } = {}): Promise<GetGeoListResponse> {
    const key = opts.geoid !== undefined ? `geoid=${opts.geoid}` : 'all';
    const cached = this.geoListCache.get(key);
    if (cached) return cached;
    const params: Record<string, number> = {};
    if (opts.geoid !== undefined) params.geoid = opts.geoid;
    const raw = await this.call<unknown>('get_geo_list', params);
    const arr: GetGeoListResponse = Array.isArray(raw) ? (raw as GetGeoListResponse) : [];
    this.geoListCache.set(key, arr);
    return arr;
  }

  async getOperators(opts: { geoid?: number } = {}): Promise<GetOperatorsListResponse> {
    const key = opts.geoid !== undefined ? `geoid=${opts.geoid}` : 'all';
    const cached = this.operatorsCache.get(key);
    if (cached) return cached;
    const params: Record<string, number> = {};
    if (opts.geoid !== undefined) params.geoid = opts.geoid;
    const raw = await this.call<unknown>('get_operators_list', params);
    const arr: GetOperatorsListResponse = Array.isArray(raw) ? (raw as GetOperatorsListResponse) : [];
    this.operatorsCache.set(key, arr);
    return arr;
  }

  /** Resolve an operator name (case-insensitive substring or exact) to its canonical name. */
  async resolveOperatorName(input: string): Promise<string | null> {
    const needle = input.toLowerCase().trim();
    const all = await this.getOperators();
    let exact: OperatorEntry | undefined;
    let partial: OperatorEntry | undefined;
    for (const op of all) {
      const name = op.operator.toLowerCase();
      if (name === needle) {
        exact = op;
        break;
      }
      if (!partial && name.includes(needle)) partial = op;
    }
    const match = exact ?? partial;
    return match ? match.operator : null;
  }

  /**
   * IP rotation goes through a separate domain and skips Bearer auth — the
   * proxy_key itself is the credential. The endpoint has its own envelope
   * shape, often returning plain text or non-standard JSON on errors, so we
   * read as text first and surface the full body when something looks off.
   */
  async rotateIp(proxyKey: string): Promise<ChangeIpResponse> {
    const url = `https://${CHANGEIP_HOST}/?proxy_key=${encodeURIComponent(proxyKey)}&format=json`;
    log.debug('rotateIp', url);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const text = await res.text();
      log.debug('rotateIp raw response', `HTTP ${res.status}`, text);

      let data: ChangeIpResponse;
      try {
        data = JSON.parse(text) as ChangeIpResponse;
      } catch {
        throw new MobileProxyAPIError(
          `Non-JSON response from changeip (HTTP ${res.status}): ${text.slice(0, 300)}`,
          text,
          res.status,
        );
      }

      /* Case-insensitive: this endpoint uses "OK" (uppercase), unlike get_balance which uses "ok". */
      const statusOk = typeof data.status === 'string' && data.status.toLowerCase() === 'ok';
      if (!statusOk) {
        const detail = data.message ?? JSON.stringify(data).slice(0, 300);
        throw new MobileProxyAPIError(`IP rotation failed: ${detail}`, data, res.status);
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

function isErrEnvelope(data: unknown): data is { status: string; message?: string } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const status = (data as { status?: unknown }).status;
  return typeof status === 'string' && status.toLowerCase() === 'err';
}

export type { Proxy };
