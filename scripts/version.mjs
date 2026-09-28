#!/usr/bin/env node
/**
 * Keeps the version in package.json, server.json (both fields) and manifest.json in lockstep.
 *
 *   node scripts/version.mjs sync            copy package.json version into the other files
 *                                            (runs from the npm "version" hook)
 *   node scripts/version.mjs check [expect]  exit 1 on any mismatch, or if expect differs
 *                                            (CI passes the tag without the leading "v")
 */
import { readFileSync, writeFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const write = (f, data) => writeFileSync(f, JSON.stringify(data, null, 2) + '\n');

const [mode, expected] = process.argv.slice(2);
const pkg = read('package.json');
const server = read('server.json');
const manifest = read('manifest.json');

if (mode === 'sync') {
  server.version = pkg.version;
  for (const p of server.packages ?? []) p.version = pkg.version;
  manifest.version = pkg.version;
  write('server.json', server);
  write('manifest.json', manifest);
  console.log(`synced server.json and manifest.json to ${pkg.version}`);
} else if (mode === 'check') {
  const found = {
    'package.json': pkg.version,
    'server.json .version': server.version,
    ...Object.fromEntries((server.packages ?? []).map((p, i) => [`server.json .packages[${i}].version`, p.version])),
    'manifest.json': manifest.version,
  };
  const want = expected ?? pkg.version;
  const bad = Object.entries(found).filter(([, v]) => v !== want);
  if (bad.length) {
    console.error(`Version mismatch, expected ${want}:`);
    for (const [where, v] of bad) console.error(`  ${where} = ${v}`);
    console.error('Fix with: node scripts/version.mjs sync (after setting package.json)');
    process.exit(1);
  }
  console.log(`all versions = ${want}`);
} else {
  console.error('usage: node scripts/version.mjs sync | check [expected]');
  process.exit(2);
}
