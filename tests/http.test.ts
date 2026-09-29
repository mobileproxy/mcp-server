import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SECRET, startApp } from './http-helpers.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function mcpClient(base: string, token: string) {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', base), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

describe('HTTP transport', () => {
  it('serves the tools over stateless HTTP with a raw API key, without local-only tools', async () => {
    const app = await startApp();
    close = app.close;
    const client = await mcpClient(app.base, 'RAWKEY0123456789');

    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toHaveLength(18);
    expect(names).not.toContain('attach_proxy_to_adspower');

    const res = await client.callTool({ name: 'get_balance', arguments: {} });
    expect(JSON.parse((res.content as { text: string }[])[0]!.text)).toMatchObject({ key_used: 'RAWKEY0123456789' });
    await client.close();
  });

  it('reuses one API client per key across requests', async () => {
    const app = await startApp();
    close = app.close;
    const client = await mcpClient(app.base, 'RAWKEY0123456789');
    await client.callTool({ name: 'get_balance', arguments: {} });
    await client.callTool({ name: 'get_balance', arguments: {} });
    expect(app.createApi).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it('rejects requests without a bearer token', async () => {
    const app = await startApp();
    close = app.close;
    const res = await fetch(`${app.base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer /);
  });

  it('points unauthenticated clients at the OAuth metadata when OAuth is on', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const res = await fetch(`${app.base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${app.base}/.well-known/oauth-protected-resource/mcp"`);
  });

  it('answers GET /mcp with 405 and exposes a health check', async () => {
    const app = await startApp();
    close = app.close;
    expect((await fetch(`${app.base}/mcp`)).status).toBe(405);
    expect(await (await fetch(`${app.base}/healthz`)).json()).toMatchObject({ status: 'ok', oauth: false });
  });
});
