#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { log } from './utils/logger.js';

async function main(): Promise<void> {
  const apiKey = process.env.MOBILEPROXY_API_KEY;
  if (!apiKey) {
    log.error('MOBILEPROXY_API_KEY environment variable is required.');
    log.error('Get your API key at https://mobileproxy.space/user.html?api');
    process.exit(1);
  }

  const server = createServer({
    apiKey,
    apiBase: process.env.MOBILEPROXY_API_BASE ?? 'https://mobileproxy.space',
    timeoutMs: Number(process.env.MOBILEPROXY_TIMEOUT_MS) || 30_000,
    debug: process.env.MOBILEPROXY_DEBUG === '1',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('MobileProxy MCP server running on stdio');
}

main().catch((err) => {
  log.error('Fatal:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
