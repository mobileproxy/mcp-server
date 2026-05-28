import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { registerListProxies } from './list-proxies.js';
import { registerGetProxyStatus } from './get-proxy-status.js';
import { registerRotateIp } from './rotate-ip.js';

export function registerTools(server: McpServer, api: MobileProxyAPI): void {
  registerListProxies(server, api);
  registerGetProxyStatus(server, api);
  registerRotateIp(server, api);
}
