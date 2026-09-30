import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '../src/tools/index.js';
import type { MobileProxyAPI } from '../src/api/client.js';

async function listTools(opts: { local: boolean }) {
  const server = new McpServer({ name: 't', version: '0' });
  registerTools(server, { call: vi.fn() } as unknown as MobileProxyAPI, opts);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return (await client.listTools()).tools;
}

/* Claude connector directory: every tool needs a title and either readOnlyHint or destructiveHint,
   names stay within 64 characters, and nothing on the hosted endpoint may spend money. */
describe.each([
  { mode: 'local (stdio)', local: true },
  { mode: 'hosted (HTTP)', local: false },
])('directory requirements — $mode', ({ local }) => {
  it('gives every tool a title and a read-only or destructive annotation', async () => {
    for (const t of await listTools({ local })) {
      expect(t.annotations?.title ?? t.title, `${t.name} title`).toBeTruthy();
      expect(t.name.length, `${t.name} length`).toBeLessThanOrEqual(64);
      const readOnly = t.annotations?.readOnlyHint === true;
      const destructive = t.annotations?.destructiveHint === true;
      expect(readOnly !== destructive, `${t.name}: exactly one of readOnlyHint / destructiveHint must be true`).toBe(true);
    }
  });

  it(local ? 'keeps purchases in the local build' : 'only quotes prices on the hosted endpoint', async () => {
    const names = (await listTools({ local })).map((t) => t.name);
    const buying = ['buy_proxy', 'renew_proxies', 'buy_residential', 'add_residential_traffic'];
    const quoting = ['quote_proxy_purchase', 'quote_renewal', 'quote_residential_purchase', 'quote_residential_topup'];
    for (const n of local ? buying : quoting) expect(names).toContain(n);
    for (const n of local ? quoting : buying) expect(names).not.toContain(n);
  });
});
