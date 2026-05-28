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

export interface Proxy {
  proxy_id: Stringish;
  proxy_type: ProxyType;
  proxy_exp: string; /* "YYYY-MM-DD HH:MM:SS" in server tz (MSK) */
  proxy_login: string;
  proxy_pass: string;
  proxy_hostname: string;
  proxy_host_ip: string;
  proxy_independent_http_hostname?: string;
  proxy_independent_http_host_ip?: string;
  proxy_independent_socks5_hostname?: string;
  proxy_independent_socks5_host_ip?: string;
  proxy_independent_port?: Stringish;
  proxy_http_port: Stringish;
  proxy_socks5_port: number; /* computed */
  proxy_geo: string; /* human-readable, NOT an ISO country code */
  proxy_auto_renewal: Stringish | boolean;
  proxy_reboot_time: Stringish;
  proxy_ipauth: string | null;
  proxy_auto_change_equipment: Stringish | boolean;
  proxy_groups_name: string | null;
  eid: Stringish;
  geoid: Stringish;
  proxy_self: Stringish | boolean;
  proxy_testing: Stringish | boolean;
  proxy_comment: string | null;
  last_time_change_equipment: string | null;
  /* type==0 only */
  proxy_operator?: string;
  proxy_change_ip_url?: string;
  proxy_key?: string;
  /* type!=2 */
  id_country?: Stringish;
  id_city?: Stringish | null;
}

/** get_my_proxy returns a raw array, not a wrapped object. */
export type GetMyProxyResponse = Proxy[];

/**
 * proxy_ip returns {ip, status:'OK'|'NULL IP'|'IP = SERVER IP', 'ipguardian.net':...}.
 * NB: the `status` field here is the IP-quality result, NOT the API success flag.
 */
export interface ProxyIpResponse {
  ip: string;
  status: string;
  'ipguardian.net'?: unknown;
  [k: string]: unknown;
}

export interface ChangeIpResponse {
  status: 'ok' | 'err';
  new_ip?: string;
  message?: string;
}

export interface ErrorResponse {
  status: 'err';
  message: string;
}
