/**
 * Response shapes for mobileproxy.space REST API.
 * Source of truth: @modules/api.php → format_proxy_row() in the PHP backend.
 */

export type ProxyType = 0 | 1 | 2; /* 0=mobile, 1=server, 2=backconnect */

export interface Proxy {
  proxy_id: number;
  proxy_type: ProxyType;
  proxy_exp: number | string; /* unix ts */
  proxy_login: string;
  proxy_pass: string;
  proxy_hostname: string;
  proxy_host_ip: string;
  proxy_independent_http_hostname?: string;
  proxy_independent_http_host_ip?: string;
  proxy_independent_socks5_hostname?: string;
  proxy_independent_socks5_host_ip?: string;
  proxy_independent_port?: number;
  proxy_http_port: number;
  proxy_socks5_port: number;
  proxy_geo: string;
  proxy_auto_renewal: number | boolean;
  proxy_reboot_time: number;
  proxy_ipauth: string | null;
  proxy_auto_change_equipment: number | boolean;
  proxy_groups_name: string | null;
  eid: number;
  geoid: number;
  proxy_self: number | boolean;
  proxy_testing: number | boolean;
  proxy_comment: string | null;
  last_time_change_equipment: number | null;
  /* type==0 only */
  proxy_operator?: string;
  proxy_change_ip_url?: string;
  proxy_key?: string;
  /* type!=2 */
  id_country?: number;
  id_city?: number | null;
}

export interface GetMyProxyResponse {
  status: 'ok';
  proxy_list: Proxy[];
}

export interface ProxyIpResponse {
  status: 'ok';
  ip: string;
  spam_list?: Record<string, boolean | string>;
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
