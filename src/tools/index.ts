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
}
