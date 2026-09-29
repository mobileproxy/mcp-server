#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MobileProxyAPI } from './api/client.js';
import { createServer } from './server.js';
import { createHttpApp } from './http/app.js';
import { isValidApiKey } from './http/oauth.js';
import { log } from './utils/logger.js';

/* mpsapi.com is the API portal and stays reachable from Russia, where mobileproxy.space is blocked. */
const apiBase = process.env.MOBILEPROXY_API_BASE ?? 'https://mpsapi.com';
const timeoutMs = Number(process.env.MOBILEPROXY_TIMEOUT_MS) || 30_000;
const newApi = (apiKey: string) => new MobileProxyAPI({ apiKey, apiBase, timeoutMs });

async function runStdio(): Promise<void> {
  const apiKey = process.env.MOBILEPROXY_API_KEY;
  if (!apiKey) {
    log.error('MOBILEPROXY_API_KEY environment variable is required.');
    log.error('Get your API key at https://mobileproxy.space/user.html?api&utm_source=mcp&utm_medium=server');
    process.exit(1);
  }

  const server = createServer(newApi(apiKey), { local: true });
  await server.connect(new StdioServerTransport());
  log.info('MobileProxy MCP server running on stdio');
}

/* Remote mode: every request carries its own key (or OAuth token), so no server-wide key is used. */
function runHttp(): void {
  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST ?? '127.0.0.1';
  const publicUrl = new URL(process.env.MOBILEPROXY_PUBLIC_URL ?? `http://localhost:${port}`);
  const oauthSecret = process.env.MOBILEPROXY_OAUTH_SECRET || undefined;
  const local = publicUrl.hostname === 'localhost' || publicUrl.hostname === '127.0.0.1';

  const app = createHttpApp({
    publicUrl,
    oauthSecret,
    trustProxy: process.env.MOBILEPROXY_TRUST_PROXY === '1',
    allowedHosts: local ? [`localhost:${port}`, `127.0.0.1:${port}`] : [publicUrl.host],
    createApi: newApi,
    validateApiKey: (apiKey) => isValidApiKey(newApi(apiKey)),
  });

  app.listen(port, host, () => {
    log.info(`MobileProxy MCP server on http://${host}:${port}/mcp — public URL ${publicUrl.origin}, OAuth ${oauthSecret ? 'on' : 'off'}`);
  });
}

const httpMode = process.argv.includes('--http') || process.env.MOBILEPROXY_TRANSPORT === 'http';

(httpMode ? Promise.resolve().then(runHttp) : runStdio()).catch((err) => {
  log.error('Fatal:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
