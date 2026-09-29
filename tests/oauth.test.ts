import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { SECRET, startApp } from './http-helpers.js';

const REDIRECT = 'http://localhost:9999/callback';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const form = (data: Record<string, string>) => new URLSearchParams(data).toString();
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

async function register(base: string, name = 'Test <script>alert(1)</script>') {
  const res = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: name, token_endpoint_auth_method: 'none' }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { client_id: string };
}

async function openConsent(base: string, clientId: string, challenge: string) {
  const url = new URL('/authorize', base);
  url.search = form({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-123',
  });
  const res = await fetch(url, { redirect: 'manual' });
  const html = await res.text();
  return { res, html, request: /name="request" value="([^"]+)"/.exec(html)?.[1] ?? '' };
}

async function submitKey(base: string, request: string, apiKey: string) {
  return fetch(`${base}/oauth/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ request, api_key: apiKey }),
    redirect: 'manual',
  });
}

async function token(base: string, params: Record<string, string>) {
  const res = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(params),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

async function authorizedCode(base: string, clientId: string, challenge: string) {
  const { request } = await openConsent(base, clientId, challenge);
  const res = await submitKey(base, request, 'GOODKEY0123456789');
  return new URL(res.headers.get('location')!).searchParams.get('code')!;
}

async function callBalance(base: string, accessToken: string) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_balance', arguments: {} } }),
  });
}

describe('OAuth 2.1', () => {
  it('publishes authorization server metadata', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const meta = await (await fetch(`${app.base}/.well-known/oauth-authorization-server`)).json();
    expect(meta).toMatchObject({
      issuer: `${app.base}/`,
      authorization_endpoint: `${app.base}/authorize`,
      token_endpoint: `${app.base}/token`,
      registration_endpoint: `${app.base}/register`,
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('runs the full flow: register, consent with API key, token, MCP call with the key inside', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const { client_id } = await register(app.base);
    const { verifier, challenge } = pkce();

    const consent = await openConsent(app.base, client_id, challenge);
    expect(consent.res.status).toBe(200);
    expect(consent.html).toContain('Test &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(consent.html).not.toContain('<script>');
    expect(consent.res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");

    const rejected = await submitKey(app.base, consent.request, 'WRONGKEY01234567');
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain('This API key was not accepted');

    const accepted = await submitKey(app.base, consent.request, 'GOODKEY0123456789');
    expect(accepted.status).toBe(302);
    const location = new URL(accepted.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('st-123');
    const code = location.searchParams.get('code')!;

    const t = await token(app.base, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id, redirect_uri: REDIRECT });
    expect(t.status).toBe(200);
    expect(t.body.access_token).toMatch(/^mpo_access\./);
    expect(t.body.token_type).toBe('bearer');
    expect(JSON.stringify(t.body)).not.toContain('GOODKEY0123456789');

    const res = await callBalance(app.base, t.body.access_token!);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('GOODKEY0123456789');
    expect(app.createApi).toHaveBeenCalledWith('GOODKEY0123456789');

    const refreshed = await token(app.base, { grant_type: 'refresh_token', refresh_token: t.body.refresh_token!, client_id });
    expect(refreshed.status).toBe(200);
    expect((await callBalance(app.base, refreshed.body.access_token!)).status).toBe(200);
  });

  it('refuses a reused authorization code', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const { client_id } = await register(app.base);
    const { verifier, challenge } = pkce();
    const code = await authorizedCode(app.base, client_id, challenge);
    const params = { grant_type: 'authorization_code', code, code_verifier: verifier, client_id, redirect_uri: REDIRECT };

    expect((await token(app.base, params)).status).toBe(200);
    const second = await token(app.base, params);
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('invalid_grant');
  });

  it('refuses a wrong PKCE verifier and a code issued to another client', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const { client_id } = await register(app.base);
    const other = await register(app.base, 'Other');
    const { challenge } = pkce();
    const code = await authorizedCode(app.base, client_id, challenge);

    const wrongVerifier = await token(app.base, {
      grant_type: 'authorization_code', code, code_verifier: pkce().verifier, client_id, redirect_uri: REDIRECT,
    });
    expect(wrongVerifier.status).toBe(400);

    const otherClient = await token(app.base, {
      grant_type: 'authorization_code', code, code_verifier: pkce().verifier, client_id: other.client_id, redirect_uri: REDIRECT,
    });
    expect(otherClient.status).toBe(400);
  });

  it('rejects tampered tokens and blobs of the wrong type', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const { client_id } = await register(app.base);
    const { verifier, challenge } = pkce();
    const code = await authorizedCode(app.base, client_id, challenge);
    const t = await token(app.base, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id, redirect_uri: REDIRECT });

    const access = t.body.access_token!;
    const i = access.length - 2;
    const flipped = access.slice(0, i) + (access[i] === 'A' ? 'B' : 'A') + access.slice(i + 1);
    expect(flipped).not.toBe(access);
    expect((await callBalance(app.base, flipped)).status).toBe(401);
    /* A refresh token or client id must never work as an access token. */
    expect((await callBalance(app.base, t.body.refresh_token!)).status).toBe(401);
    expect((await callBalance(app.base, client_id)).status).toBe(401);
  });

  it('refuses an expired or forged consent request', async () => {
    const app = await startApp({ oauthSecret: SECRET });
    close = app.close;
    const res = await submitKey(app.base, 'mpo_request.forged', 'GOODKEY0123456789');
    expect(res.status).toBe(400);
    expect(app.validateApiKey).not.toHaveBeenCalled();
  });
});
