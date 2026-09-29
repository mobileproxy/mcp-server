#!/usr/bin/env node
/**
 * Live smoke test against the real API. Nothing here spends money: purchases run
 * only with estimate_only=true. It DOES rotate the IP of your first mobile proxy.
 *
 * Usage:
 *   $env:MOBILEPROXY_API_KEY = "..."
 *   npm run build; node scripts/smoke.mjs
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

/** Calls a tool, prints the result, flags failures. Returns parsed JSON or null. */
async function call(name, args = {}, maxChars = 2000) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    console.log('isError:', res.isError ?? false);
    console.log(truncate(text || '(empty)', maxChars));
    if (res.isError) {
      exitCode = 1;
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (e) {
    console.error('TOOL ERROR:', e.message);
    exitCode = 1;
    return null;
  }
}

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
  let firstResidentialId = null;
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
          const residential = parsed.proxies.find((p) => Number(p.proxy_type) === 3);
          if (residential) firstResidentialId = Number(residential.proxy_id);
          console.log(`\n>> firstProxyId=${firstProxyId}  firstMobileId=${firstMobileId}  firstResidentialId=${firstResidentialId}`);
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

  sectionDivider('6. callTool get_balance');
  try {
    const res = await client.callTool({ name: 'get_balance', arguments: {} });
    console.log('isError:', res.isError ?? false);
    console.log(truncate(res.content?.[0]?.text ?? '(empty)', 1000));
    if (res.isError) exitCode = 1;
  } catch (e) {
    console.error('TOOL ERROR:', e.message);
    exitCode = 1;
  }

  sectionDivider('7. callTool get_geo_list (country=RU)');
  try {
    const res = await client.callTool({
      name: 'get_geo_list',
      arguments: { country: 'RU' },
    });
    console.log('isError:', res.isError ?? false);
    console.log(truncate(res.content?.[0]?.text ?? '(empty)', 1500));
    if (res.isError) exitCode = 1;
  } catch (e) {
    console.error('TOOL ERROR:', e.message);
    exitCode = 1;
  }

  sectionDivider('8. callTool get_price (country=RU, currency=RUB)');
  try {
    const res = await client.callTool({
      name: 'get_price',
      arguments: { country: 'RU', currency: 'RUB' },
    });
    console.log('isError:', res.isError ?? false);
    console.log(truncate(res.content?.[0]?.text ?? '(empty)', 2500));
    if (res.isError) exitCode = 1;
  } catch (e) {
    console.error('TOOL ERROR:', e.message);
    exitCode = 1;
  }

  sectionDivider('9. callTool list_residential_plans');
  const plansRes = await call('list_residential_plans', {}, 1500);
  const firstPlanId = plansRes?.plans?.[0] ? Number(plansRes.plans[0].price_id) : null;
  if (plansRes && !firstPlanId) {
    console.log('>> no residential plans returned — backend endpoint may be missing');
    exitCode = 1;
  }

  sectionDivider('10. callTool get_residential_locations (countries, then US regions)');
  const countriesRes = await call('get_residential_locations', { type: 'countries' }, 800);
  if (countriesRes && !(countriesRes.countries?.length > 0)) {
    console.log('>> empty country list');
    exitCode = 1;
  }
  await call('get_residential_locations', { type: 'regions', country: 'US' }, 800);

  if (firstPlanId) {
    sectionDivider(`11. callTool buy_residential (price_id=${firstPlanId}, estimate_only=true — no charge)`);
    await call('buy_residential', { price_id: firstPlanId, num: 1, estimate_only: true }, 1200);
  } else {
    sectionDivider('11. buy_residential estimate — SKIPPED (no plan)');
  }

  if (firstResidentialId) {
    sectionDivider(`12. callTool set_residential_geo (proxy_id=${firstResidentialId}, read-only)`);
    await call('set_residential_geo', { proxy_id: firstResidentialId }, 1500);

    sectionDivider(`13. callTool get_residential_traffic (proxy_id=${firstResidentialId}, days=7)`);
    await call('get_residential_traffic', { proxy_id: firstResidentialId, days: 7 }, 1500);
  } else {
    sectionDivider('12–13. residential geo/traffic — SKIPPED (no residential proxy in account)');
  }

  sectionDivider('14. callTool get_health_snapshot (check_spam=true)');
  const health = await call('get_health_snapshot', { check_spam: true }, 1500);
  if (health && typeof health.balance_rub !== 'number') {
    console.log('>> balance_rub missing or not a number');
    exitCode = 1;
  }

  sectionDivider('15. callTool find_available_geo (country=RU, city=Moscow)');
  const geoRes = await call('find_available_geo', { country: 'RU', city: 'Moscow', limit: 3 }, 1500);
  if (geoRes && !(geoRes.prices?.per_period?.length > 0)) {
    console.log('>> no mobile prices returned');
    exitCode = 1;
  }

  if (firstProxyId) {
    sectionDivider(`16. callTool get_connection_string (proxy_id=${firstProxyId})`);
    const conn = await call('get_connection_string', { proxy_id: firstProxyId }, 400);
    if (conn && !/^(http|socks5):\/\//.test(conn.http_url ?? '')) {
      console.log('>> http_url is not a proxy URL');
      exitCode = 1;
    }
  } else {
    sectionDivider('16. get_connection_string — SKIPPED (no proxy_id)');
  }

  /* change_geo, rotate_until_clean, real purchases and set_residential_geo writes are
     intentionally skipped: change_geo has a cooldown and rearranges hardware,
     rotate_until_clean rotates repeatedly (rotate_ip above already covers rotation),
     purchases spend real money, and a residential geo write rewrites the proxy login. */
  sectionDivider('SKIPPED: change_geo, rotate_until_clean, real purchases, residential geo writes');

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
