import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { registerListProxies } from './list-proxies.js';
import { registerGetProxyStatus } from './get-proxy-status.js';
import { registerRotateIp } from './rotate-ip.js';
import { registerGetBalance } from './get-balance.js';
import { registerGetGeoList } from './get-geo-list.js';
import { registerGetPrice } from './get-price.js';
import { registerChangeGeo } from './change-geo.js';
import { registerBuyProxy } from './buy-proxy.js';
import { registerResidentialPlans } from './residential-plans.js';
import { registerResidentialLocations } from './residential-locations.js';
import { registerResidentialTraffic } from './residential-traffic.js';
import { registerResidentialGeo } from './residential-geo.js';
import { registerResidentialBuy, registerResidentialAddTraffic } from './residential-buy.js';
import { registerGetHealthSnapshot } from './get-health-snapshot.js';
import { registerFindAvailableGeo } from './find-available-geo.js';
import { registerGetConnectionString } from './get-connection-string.js';
import { registerRotateUntilClean } from './rotate-until-clean.js';
import { registerAttachProxyToAdsPower } from './attach-proxy-to-adspower.js';
import { registerTcpFingerprint } from './tcp-fingerprint.js';
import {
  registerRenewProxies,
  registerUpdateProxySettings,
  registerChangeProxyCredentials,
  registerRebootModem,
} from './proxy-management.js';
import { registerAccountHistory } from './account-history.js';

/**
 * local=false on the hosted HTTP endpoint: tools that talk to apps on the user's machine are
 * left out, and purchases default to quote-only (the Claude connector directory does not accept
 * connectors that execute financial transactions for users).
 */
export function registerTools(
  server: McpServer,
  api: MobileProxyAPI,
  opts: { local?: boolean; purchases?: boolean } = {},
): void {
  const local = opts.local ?? true;
  const purchases = opts.purchases ?? local;

  /* Account and catalogue — read-only */
  registerListProxies(server, api);
  registerGetProxyStatus(server, api);
  registerGetBalance(server, api);
  registerAccountHistory(server, api);
  registerGetGeoList(server, api);
  registerGetPrice(server, api);

  /* Changes to existing proxies */
  registerRotateIp(server, api);
  registerChangeGeo(server, api);
  registerUpdateProxySettings(server, api);
  registerChangeProxyCredentials(server, api);
  registerRebootModem(server, api);

  /* Money: buy / renew, or quote-only when purchases are off */
  registerBuyProxy(server, api, { purchases });
  registerRenewProxies(server, api, { purchases });

  /* Residential (type 3) — billed by traffic volume rather than rental period,
     so it needs its own plan/geo/top-up tools instead of reusing the mobile ones. */
  registerResidentialPlans(server, api);
  registerResidentialLocations(server, api);
  registerResidentialTraffic(server, api);
  registerResidentialGeo(server, api);
  registerResidentialBuy(server, api, { purchases });
  registerResidentialAddTraffic(server, api, { purchases });

  /* Agent workflows — one call for what otherwise takes a chain of the tools above. */
  registerGetHealthSnapshot(server, api);
  registerFindAvailableGeo(server, api);
  registerGetConnectionString(server, api);
  registerRotateUntilClean(server, api);

  /* TCP fingerprint — network-level OS signature for mobile and server proxies. */
  registerTcpFingerprint(server, api);

  /* Local integrations — reach apps running on the user's computer. */
  if (local) registerAttachProxyToAdsPower(server, api);
}
