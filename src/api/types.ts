/**
 * Response shapes for mobileproxy.space REST API.
 * Source of truth: @modules/api.php → format_proxy_row() in the PHP backend.
 *
 * NOTE: numeric fields come back as STRINGS from PHP/MySQL (e.g. proxy_id="491660",
 * geoid="260", proxy_auto_renewal="0"), except those computed in PHP arithmetic
 * (e.g. proxy_socks5_port = phone_list_port + 1 → number). Use Stringish<T> helpers
 * when comparing. proxy_exp is a MySQL DATETIME string "YYYY-MM-DD HH:MM:SS",
 * NOT a unix timestamp.
 */

export type Stringish = string | number;

/** 0=mobile, 1=server, 2=backconnect, 3=residential. */
export type ProxyType = 0 | 1 | 2 | 3;

export const PROXY_TYPE_NAMES: Record<number, string> = { 0: 'mobile', 1: 'server', 2: 'backconnect', 3: 'residential' };

export interface Proxy {
  proxy_id: Stringish;
  proxy_type: ProxyType;
  proxy_exp: string; /* "YYYY-MM-DD HH:MM:SS" in server tz (MSK) */
  proxy_login: string;
  proxy_pass: string;
  proxy_hostname: string;
  /** null for residential: the provider entry point sits behind a CNAME. */
  proxy_host_ip: string | null;
  proxy_independent_http_hostname?: string | null;
  proxy_independent_http_host_ip?: string | null;
  proxy_independent_socks5_hostname?: string | null;
  proxy_independent_socks5_host_ip?: string | null;
  proxy_independent_port?: Stringish | null;
  proxy_http_port: Stringish;
  /** Computed. For residential equals proxy_http_port — one port serves both protocols. */
  proxy_socks5_port: Stringish;
  proxy_geo: string; /* human-readable, NOT an ISO country code (residential: country or "Global") */
  proxy_auto_renewal: Stringish | boolean;
  proxy_groups_name: string | null;
  proxy_self: Stringish | boolean;
  proxy_testing: Stringish | boolean;
  proxy_comment: string | null;
  /* Modem-model fields — ABSENT for residential (type 3): no modem behind it,
     so no timer reboot, no IP-auth binding and no equipment change. */
  proxy_reboot_time?: Stringish;
  proxy_ipauth?: string | null;
  proxy_auto_change_equipment?: Stringish | boolean;
  eid?: Stringish;
  geoid?: Stringish;
  last_time_change_equipment?: string | null;
  /* type==0 only */
  proxy_operator?: string;
  proxy_change_ip_url?: string;
  proxy_key?: string;
  /* types 0 and 1 only (absent for backconnect and residential) */
  id_country?: Stringish;
  id_city?: Stringish | null;
  /* type==3 only — traffic quota and current geo targeting of the package */
  residential_traffic_limit_mb?: Stringish;
  residential_traffic_used_mb?: Stringish;
  residential_traffic_left_mb?: Stringish;
  residential_country?: string;
  residential_state?: string;
  residential_city?: string;
  residential_asn?: string;
  residential_session?: string;
  residential_session_time?: Stringish;
}

/** get_my_proxy returns a raw array, not a wrapped object. */
export type GetMyProxyResponse = Proxy[];

/* ===== Residential (type 3) ===== */

export interface ResidentialPlan {
  price_id: Stringish;
  traffic_gb: Stringish;
  traffic_mb: Stringish;
  sum: Stringish;
  period_days: Stringish;
}
export type ResidentialPlansResponse = ResidentialPlan[];

export interface ResidentialCountry {
  code: string;
  title: string;
  title_ru: string;
}
export type ResidentialCountriesResponse = ResidentialCountry[];

/**
 * regions → {id, code, title_ru}; cities → {code, title_ru}; asns → {code, title}.
 * `code` is what the provider login accepts — always send that back, never the localized name.
 * `title_ru` is empty when no translation exists (small towns are not covered).
 */
export interface ResidentialLocation {
  id?: number;
  code: string;
  title?: string;
  title_ru?: string;
}
export type ResidentialLocationsResponse = ResidentialLocation[];

export interface ResidentialTrafficPoint {
  date: string;
  delta_mb: Stringish;
}
export type ResidentialTrafficResponse = ResidentialTrafficPoint[];

export interface ResidentialBuyResponse {
  status: string;
  proxy_id: number[];
  amount: Stringish;
  traffic_mb: Stringish;
  message: string;
}

export interface ResidentialAddTrafficResponse {
  status: string;
  proxy_id: Stringish;
  amount: Stringish;
  traffic_added_mb: Stringish;
  message: string;
}

export interface ResidentialSettingsResponse {
  status: string;
  proxy_id: Stringish;
  country: string;
  state: string;
  city: string;
  asn: string;
  session: string;
  session_mode: 'rotating' | 'sticky';
  session_time: Stringish;
  http: string;
  socks5: string;
}

/** Present only with check_spam=true. found=false means the IP is on no blacklist. */
export interface IpGuardianResult {
  ip: string;
  found: boolean;
  sources: unknown[];
}

/**
 * proxy_ip returns {ip, status:'OK'|'NULL IP'|'IP = SERVER IP', 'ipguardian.net':...}.
 * NB: the `status` field here is the IP-quality result, NOT the API success flag.
 */
export interface ProxyIpResponse {
  ip: string;
  status: string;
  'ipguardian.net'?: IpGuardianResult;
  [k: string]: unknown;
}

export interface ChangeIpResponse {
  status: 'ok' | 'err' | 'OK' | 'ERR' | string;
  new_ip?: string;
  message?: string;
  code?: number;
  rt?: string; /* rotation time in seconds */
  proxy_id?: Stringish;
}

export interface ErrorResponse {
  status: 'err';
  message: string;
}

/** get_balance returns {status:"ok", balance:<num>, can_payout?:<num>}. */
export interface BalanceResponse {
  status: 'ok';
  balance: Stringish;
  can_payout?: Stringish;
  [k: string]: unknown;
}

/** get_id_country returns {status:"ok", id_country:{<id>: CountryEntry}}. */
export interface CountryEntry {
  id_country: Stringish;
  name: string;
  ISO: string; /* 2-letter, e.g. "RU", "FR" */
  modems?: Stringish; /* only when ?only_avaliable=1 */
}
export interface GetIdCountryResponse {
  status: 'ok';
  id_country: Record<string, CountryEntry>;
}

/** get_geo_list returns a raw array (no envelope). */
export interface GeoEntry {
  geoid: Stringish;
  geo_caption: string; /* human-readable, localized via Accept-Language */
  count_free: Stringish;
  iso: string;
  id_city: Stringish;
}
export type GetGeoListResponse = GeoEntry[];

/** get_operators_list returns a raw array (no envelope). */
export interface OperatorEntry {
  operator: string;
  count_free: Stringish;
  id_country: Stringish;
}
export type GetOperatorsListResponse = OperatorEntry[];

/** get_price returns {status:"ok", price:[PriceEntry,...]}. */
export interface PriceEntry {
  id_country: Stringish;
  iso: string;
  amount: Stringish;
  country_name: string;
  period: Stringish; /* days */
  type?: Stringish; /* proxy type the price applies to (0 = mobile) */
}
export interface GetPriceResponse {
  status: 'ok';
  price: PriceEntry[];
}

/** change_equipment: status='ok' on success, 'err' on full failure;
 *  message and error are maps proxy_id → string. */
export interface ChangeEquipmentResponse {
  status: 'ok' | 'err';
  message?: Record<string, string>;
  error?: Record<string, string>;
  checked?: Record<string, string>;
  'ipguardian.net'?: Record<string, unknown>;
}

/** buyproxy success: {status, proxy_id:[..], amount, message, proxy_data:{<id>:Proxy}}. */
export interface BuyProxyResponse {
  status: 'ok';
  proxy_id: Stringish[];
  amount: Stringish;
  message: string;
  proxy_data: Record<string, Proxy>;
}
