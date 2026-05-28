#!/usr/bin/env node
/**
 * Live smoke test for the 3 MVP tools.
 *
 * Usage:
 *   $env:MOBILEPROXY_API_KEY = "..."
 *   node scripts/smoke.mjs
 *
 * This is NOT committed test data — it spawns dist/index.js as a child process
 * and talks to the real mobileproxy.space API over the same stdio transport that
 * Claude Desktop / Code would use.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, '..', 'dist', 'index.js');

const apiKey = process.env.MOBILEPROXY_API_KEY;
if (!apiKey) {
  console.error('Set $env:MOBILEPROXY_API_KEY before running smoke.mjs');
  process.exit(2);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: {
    ...process.env,
    MOBILEPROXY_API_KEY: apiKey,
    MOBILEPROXY_DEBUG: '1',
  },
  stderr: 'inherit', /* see server logs */
});

const client = new Client({ name: 'smoke', version: '0.0.1' });

const sectionDivider = (s) => console.log('\n' + '═'.repeat(60) + '\n  ' + s + '\n' + '═'.repeat(60));
const truncate = (s, n = 4000) => (s.length > n ? s.slice(0, n) + `\n... [truncated ${s.length - n} more chars]` : s);

let exitCode = 0;
try {
  sectionDivider('1. connect()');
  await client.connect(transport);
  console.log('connected');

  sectionDivider('2. listTools()');
  const tools = await client.listTools();
  console.log('tools:', tools.tools.map((t) => t.name));
  console.log('count:', tools.tools.length);

  sectionDivider('3. callTool list_proxies (no args)');
  let firstProxyId = null;
  let firstMobileId = null;
  try {
    const res = await client.callTool({ name: 'list_proxies', arguments: {} });
    console.log('isError:', res.isError ?? false);
    const text = res.content?.[0]?.text ?? '';
    console.log(truncate(text, 3000));
    if (res.isError) {
      exitCode = 1;
    } else {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.proxies) && parsed.proxies.length > 0) {
          firstProxyId = Number(parsed.proxies[0].proxy_id);
          const mobile = parsed.proxies.find((p) => Number(p.proxy_type) === 0);
          if (mobile) firstMobileId = Number(mobile.proxy_id);
          console.log(`\n>> firstProxyId=${firstProxyId}  firstMobileId=${firstMobileId}`);
        } else {
          console.log('>> no proxies in account (account empty?)');
        }
      } catch (e) {
        console.log('>> response was not parseable JSON:', e.message);
        exitCode = 1;
      }
    }
  } catch (e) {
    console.error('TOOL ERROR:', e.message);
    exitCode = 1;
  }

  if (firstProxyId) {
    sectionDivider(`4. callTool get_proxy_status (proxy_id=${firstProxyId}, check_spam=false)`);
    try {
      const res = await client.callTool({
        name: 'get_proxy_status',
        arguments: { proxy_id: firstProxyId, check_spam: false },
      });
      console.log('isError:', res.isError ?? false);
      console.log(truncate(res.content?.[0]?.text ?? '(empty)', 2000));
      if (res.isError) exitCode = 1;
    } catch (e) {
      console.error('TOOL ERROR:', e.message);
      exitCode = 1;
    }
  } else {
    sectionDivider('4. get_proxy_status — SKIPPED (no proxy_id)');
  }

  if (firstMobileId) {
    sectionDivider(`5. callTool rotate_ip (proxy_id=${firstMobileId}, verify=true)`);
    console.log('NOTE: this will trigger a real IP rotation on your mobile proxy.');
    try {
      const res = await client.callTool({
        name: 'rotate_ip',
        arguments: { proxy_id: firstMobileId, verify: true },
      });
      console.log('isError:', res.isError ?? false);
      console.log(truncate(res.content?.[0]?.text ?? '(empty)', 2000));
      if (res.isError) exitCode = 1;
    } catch (e) {
      console.error('TOOL ERROR:', e.message);
      exitCode = 1;
    }
  } else {
    sectionDivider('5. rotate_ip — SKIPPED (no mobile proxy_id)');
  }

  sectionDivider(`Result: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
} catch (err) {
  console.error('\nUNEXPECTED:', err);
  exitCode = 1;
} finally {
  try {
    await client.close();
  } catch {
    /* ignore */
  }
}

process.exit(exitCode);
