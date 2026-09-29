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

export function registerTools(server: McpServer, api: MobileProxyAPI): void {
  /* Read-only / cheap */
  registerListProxies(server, api);
  registerGetProxyStatus(server, api);
  registerGetBalance(server, api);
  registerGetGeoList(server, api);
  registerGetPrice(server, api);
  /* Mutating but non-destructive */
  registerRotateIp(server, api);
  registerChangeGeo(server, api);
  /* Destructive (charges balance) */
  registerBuyProxy(server, api);

  /* Residential (type 3) — billed by traffic volume rather than rental period,
     so it needs its own plan/geo/top-up tools instead of reusing the mobile ones. */
  registerResidentialPlans(server, api);
  registerResidentialLocations(server, api);
  registerResidentialTraffic(server, api);
  registerResidentialGeo(server, api);
  registerResidentialBuy(server, api);
  registerResidentialAddTraffic(server, api);

  /* Agent workflows — one call for what otherwise takes a chain of the tools above. */
  registerGetHealthSnapshot(server, api);
  registerFindAvailableGeo(server, api);
  registerGetConnectionString(server, api);
  registerRotateUntilClean(server, api);
}
