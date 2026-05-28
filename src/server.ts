import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MobileProxyAPI } from './api/client.js';
import { registerTools } from './tools/index.js';

export interface ServerConfig {
  apiKey: string;
  apiBase: string;
  timeoutMs: number;
  debug: boolean;
}

export function createServer(config: ServerConfig): McpServer {
  const api = new MobileProxyAPI(config);

  const server = new McpServer({
    name: 'mobileproxy',
    version: '0.1.0',
  });

  registerTools(server, api);

  return server;
}
