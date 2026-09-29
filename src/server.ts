import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from './api/client.js';
import { registerTools } from './tools/index.js';
import { VERSION } from './version.js';

export function createServer(api: MobileProxyAPI, opts: { local: boolean }): McpServer {
  const server = new McpServer({
    name: 'mobileproxy',
    version: VERSION,
  });

  registerTools(server, api, opts);

  return server;
}
