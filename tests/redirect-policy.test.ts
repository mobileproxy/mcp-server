import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyRedirect, redirectUriProblem, trustedHostsFromEnv } from '../src/http/redirect-policy.js';
import { Sealer } from '../src/http/seal.js';
import { SECRET, startApp } from './http-helpers.js';

describe('redirect URI policy', () => {
  it('accepts https, loopback http and native app schemes', () => {
    for (const uri of [
      'https://claude.ai/api/mcp/auth_callback',
      'https://ray.run/oauth/upstream/callback',
      'http://localhost:9999/callback',
      'http://127.0.0.1:33418/',
      'http://[::1]:8080/cb',
      'cursor://anysphere.cursor-mcp/oauth/callback',
      'com.example.app:/oauth2redirect',
    ]) expect(redirectUriProblem(uri), uri).toBeUndefined();
  });

  it('refuses remote http, executable or local schemes, fragments and garbage', () => {
    for (const uri of [
      'http://attacker.example.com/cb',
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'https://claude.ai/cb#frag',
      'not a uri',
    ]) expect(redirectUriProblem(uri), uri).toBeDefined();
  });

  it('marks only known MCP clients and local apps as known', () => {
    expect(classifyRedirect('https://claude.ai/api/mcp/auth_callback')).toEqual({ known: true, display: 'claude.ai' });
    expect(classifyRedirect('http://localhost:9999/callback').known).toBe(true);
    expect(classifyRedirect('cursor://anysphere.cursor-mcp/oauth/callback').known).toBe(true);
    expect(classifyRedirect('https://evil.claude.ai.example.com/cb').known).toBe(false);
    expect(classifyRedirect('https://sub.claude.ai/cb').known).toBe(false);
    expect(classifyRedirect('https://attacker.example.com/cb')).toEqual({ known: false, display: 'attacker.example.com' });
    expect(classifyRedirect('com.example.app:/cb').known).toBe(false);
  });

  it('extends the trusted hosts from the environment', () => {
    const hosts = trustedHostsFromEnv(' ray.run, Example.org ,bad host,');
    expect(hosts).toContain('claude.ai');
    expect(hosts).toContain('ray.run');
    expect(hosts).toContain('example.org');
    expect(hosts).not.toContain('bad host');
    expect(classifyRedirect('https://ray.run/cb', hosts).known).toBe(true);
  });
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const challenge = () => createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url');

async function register(base: string, redirect: string, name = 'Some App') {
  return fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirect], client_name: name, token_endpoint_auth_method: 'none' }),
  });
}

async function authorize(base: string, clientId: string, redirect: string) {
  const url = new URL('/authorize', base);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirect,
    code_challenge: challenge(), code_challenge_method: 'S256', state: 'st',
  }).toString();
  const res = await fetch(url, { redirect: 'manual' });
  return { res, html: await res.text() };
}

describe('OAuth redirect policy over HTTP', () => {
  it('refuses to register a remote http or javascript redirect', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    for (const bad of ['http://attacker.example.com/cb', 'javascript:alert(1)']) {
      const res = await register(app.base, bad);
      expect(res.status, bad).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('invalid_client_metadata');
    }
  });

  it('warns on the consent page when the return host is not a known client', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const redirect = 'https://attacker-alpha.example.com/cb';
    const reg = await register(app.base, redirect, 'Claude');
    expect(reg.status).toBe(201);
    const { client_id } = (await reg.json()) as { client_id: string };
    const { res, html } = await authorize(app.base, client_id, redirect);
    expect(res.status).toBe(200);
    expect(html).toContain('class="warn"');
    expect(html).toContain('Unknown app');
    expect(html).toContain('unverified');
    expect(html).toContain('attacker-alpha.example.com');
  });

  it('shows no warning for a known client', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const redirect = 'https://claude.ai/api/mcp/auth_callback';
    const { client_id } = (await (await register(app.base, redirect, 'Claude')).json()) as { client_id: string };
    const { res, html } = await authorize(app.base, client_id, redirect);
    expect(res.status).toBe(200);
    expect(html).not.toContain('class="warn"');
    expect(html).not.toContain('unverified');
    expect(html).toContain('claude.ai');
  });

  it('refuses to authorize a client registered before the policy with a remote http redirect', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const redirect = 'http://attacker.example.com/cb';
    const legacyId = new Sealer(SECRET).seal(
      'client',
      { c: { redirect_uris: [redirect], client_name: 'Legacy', token_endpoint_auth_method: 'none', client_id_issued_at: 1 } },
      3600,
    );
    const { res, html } = await authorize(app.base, legacyId, redirect);
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(html).toContain('cannot be authorized');
  });
});
