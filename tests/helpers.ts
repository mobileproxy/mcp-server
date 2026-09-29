import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { MobileProxyAPI } from '../src/api/client.js';

export interface ToolResult {
  isError: boolean;
  text: string;
  json: any;
}

/** Registers tools against a stub API and returns a caller that goes through a real MCP client. */
export async function connect(
  register: (server: McpServer, api: MobileProxyAPI) => void,
  api: Record<string, unknown>,
): Promise<(name: string, args?: Record<string, unknown>) => Promise<ToolResult>> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, api as unknown as MobileProxyAPI);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  return async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0]?.text ?? '';
    return { isError: Boolean(res.isError), text, json: res.isError ? null : JSON.parse(text) };
  };
}

/** Backend DATETIME string in Moscow time, `hours` from now. */
export function mskIn(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000 + 3 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
}
