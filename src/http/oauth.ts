import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { OAuthServerProvider, OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { MobileProxyAPI } from '../api/client.js';
import { MobileProxyAPIError } from '../api/errors.js';
import { log } from '../utils/logger.js';
import type { Sealer } from './seal.js';

const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 86400;
const CODE_TTL = 300;
const REQUEST_TTL = 600;
const CLIENT_TTL = 5 * 365 * 86400;
const CONSENT_PATH = '/oauth/consent';

interface PendingRequest { cid: string; ru: string; st?: string; cc: string; sc?: string[] }
interface CodeData { k: string; cid: string; ru: string; cc: string; sc?: string[] }
interface TokenData { k: string; cid: string; sc?: string[] }

/** true if the backend accepts the key, false if it rejects it; network failures propagate. */
export async function isValidApiKey(api: MobileProxyAPI): Promise<boolean> {
  try {
    await api.call('get_balance');
    return true;
  } catch (err) {
    if (err instanceof MobileProxyAPIError && /authorization error/i.test(err.message)) return false;
    throw err;
  }
}

/**
 * Accepts either an OAuth access token issued by this server or a raw mobileproxy.space
 * API key, and exposes the API key to the MCP handler as authInfo.extra.apiKey.
 */
export function createTokenVerifier(sealer?: Sealer): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (token.startsWith('mpo_')) {
        const t = sealer?.unseal<TokenData>('access', token);
        if (!t) throw new InvalidTokenError('Access token is invalid or expired');
        return { token, clientId: t.cid, scopes: t.sc ?? [], expiresAt: t.exp, extra: { apiKey: t.k } };
      }
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
        throw new InvalidTokenError('Send your mobileproxy.space API key or an OAuth access token as the Bearer token');
      }
      /* Raw keys don't expire here; the backend rejects them if they are revoked. */
      return { token, clientId: 'api-key', scopes: [], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { apiKey: token } };
    },
  };
}

export function createOAuth(opts: {
  sealer: Sealer;
  verifier: OAuthTokenVerifier;
  validateApiKey: (apiKey: string) => Promise<boolean>;
}) {
  const { sealer } = opts;

  /* Codes are self-contained, so single use is enforced by remembering spent ones until they expire. */
  const spentCodes = new Map<string, number>();
  const spend = (code: string, exp: number) => {
    const now = Date.now() / 1000;
    for (const [h, e] of spentCodes) if (e < now) spentCodes.delete(h);
    const h = createHash('sha256').update(code).digest('hex');
    if (spentCodes.has(h)) throw new InvalidGrantError('Authorization code was already used');
    spentCodes.set(h, exp);
  };

  const attempts = new Map<string, { count: number; reset: number }>();
  const allowAttempt = (ip: string) => {
    const now = Date.now();
    if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
    const a = attempts.get(ip);
    if (!a || a.reset < now) {
      attempts.set(ip, { count: 1, reset: now + 5 * 60_000 });
      return true;
    }
    a.count += 1;
    return a.count <= 10;
  };

  const getClient = (clientId: string): OAuthClientInformationFull | undefined => {
    const c = sealer.unseal<{ c: Omit<OAuthClientInformationFull, 'client_id'> }>('client', clientId);
    return c ? ({ ...c.c, client_id: clientId } as OAuthClientInformationFull) : undefined;
  };

  const clientsStore: OAuthRegisteredClientsStore = {
    getClient,
    registerClient(client) {
      const issued = Math.floor(Date.now() / 1000);
      const stored = { ...client, client_id_issued_at: issued };
      return { ...stored, client_id: sealer.seal('client', { c: stored }, CLIENT_TTL) } as OAuthClientInformationFull;
    },
  };

  const issueTokens = (k: string, cid: string, sc?: string[]): OAuthTokens => ({
    access_token: sealer.seal('access', { k, cid, sc }, ACCESS_TTL),
    token_type: 'bearer',
    expires_in: ACCESS_TTL,
    refresh_token: sealer.seal('refresh', { k, cid, sc }, REFRESH_TTL),
    ...(sc?.length ? { scope: sc.join(' ') } : {}),
  });

  const provider: OAuthServerProvider = {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(client, params, res) {
      const request = sealer.seal(
        'request',
        { cid: client.client_id, ru: params.redirectUri, st: params.state, cc: params.codeChallenge, sc: params.scopes },
        REQUEST_TTL,
      );
      sendConsentPage(res, { clientName: client.client_name, redirectUri: params.redirectUri, state: params.state, request });
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      const c = sealer.unseal<CodeData>('code', authorizationCode);
      if (!c || c.cid !== client.client_id) throw new InvalidGrantError('Authorization code is invalid or expired');
      return c.cc;
    },

    async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
      const c = sealer.unseal<CodeData>('code', authorizationCode);
      if (!c || c.cid !== client.client_id) throw new InvalidGrantError('Authorization code is invalid or expired');
      if (redirectUri !== undefined && redirectUri !== c.ru) throw new InvalidGrantError('redirect_uri does not match the authorization request');
      spend(authorizationCode, c.exp);
      return issueTokens(c.k, c.cid, c.sc);
    },

    async exchangeRefreshToken(client, refreshToken) {
      const t = sealer.unseal<TokenData>('refresh', refreshToken);
      if (!t || t.cid !== client.client_id) throw new InvalidGrantError('Refresh token is invalid or expired');
      return issueTokens(t.k, t.cid, t.sc);
    },

    verifyAccessToken: (token) => opts.verifier.verifyAccessToken(token),
  };

  /** POST target of the consent page: checks the key, then redirects back to the client with a code. */
  async function consentHandler(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const requestBlob = String(body.request ?? '');
    const pending = sealer.unseal<PendingRequest>('request', requestBlob);
    const client = pending ? getClient(pending.cid) : undefined;
    if (!pending || !client) {
      res.status(400).type('text/plain').send('This sign-in page has expired. Start the connection again from your MCP client.');
      return;
    }
    const page = { clientName: client.client_name, redirectUri: pending.ru, state: pending.st, request: requestBlob };

    if (!allowAttempt(req.ip ?? 'unknown')) {
      sendConsentPage(res.status(429), { ...page, error: 'Too many attempts. Wait five minutes and try again.' });
      return;
    }

    const apiKey = String(body.api_key ?? '').trim();
    let valid = false;
    try {
      valid = apiKey.length > 0 && (await opts.validateApiKey(apiKey));
    } catch (err) {
      log.error('API key check failed', err instanceof Error ? err.message : String(err));
      sendConsentPage(res.status(502), { ...page, error: 'mobileproxy.space did not respond. Try again in a minute.' });
      return;
    }
    if (!valid) {
      sendConsentPage(res.status(400), { ...page, error: 'This API key was not accepted. Copy it again from mobileproxy.space → API.' });
      return;
    }

    const code = sealer.seal('code', { k: apiKey, cid: pending.cid, ru: pending.ru, cc: pending.cc, sc: pending.sc }, CODE_TTL);
    const target = new URL(pending.ru);
    target.searchParams.set('code', code);
    if (pending.st !== undefined) target.searchParams.set('state', pending.st);
    res.redirect(302, target.href);
  }

  return { provider, consentHandler, consentPath: CONSENT_PATH };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function sendConsentPage(
  res: Response,
  p: { clientName?: string; redirectUri: string; state?: string; request: string; error?: string },
): void {
  const redirect = new URL(p.redirectUri);
  const cancel = new URL(p.redirectUri);
  cancel.searchParams.set('error', 'access_denied');
  if (p.state !== undefined) cancel.searchParams.set('state', p.state);
  const app = escapeHtml(p.clientName || 'An MCP client');

  res
    .set({
      'Content-Security-Policy':
        `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${redirect.origin}; frame-ancestors 'none'; base-uri 'none'`,
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    })
    .type('html')
    .send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect MobileProxy</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;color:#1c2330;margin:0;padding:24px 16px}
main{max-width:440px;margin:40px auto;background:#fff;border:1px solid #dde1e7;border-radius:10px;padding:28px}
h1{font-size:20px;margin:0 0 12px}p{margin:0 0 14px}.muted{color:#5b6573;font-size:13px}
label{display:block;font-weight:600;margin:18px 0 6px}input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #c5cbd3;border-radius:6px;font:inherit}
button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:6px;background:#2f3c50;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{background:#fdecea;color:#8a1c14;border-radius:6px;padding:10px 12px;margin-bottom:14px}a{color:#2f5fa6}
</style></head><body><main>
<h1>Connect MobileProxy · Подключение MobileProxy</h1>
${p.error ? `<div class="err">${escapeHtml(p.error)}</div>` : ''}
<p><strong>${app}</strong> will get access to your mobileproxy.space account: list and manage proxies, rotate IPs, and make purchases after your confirmation in the chat.</p>
<p class="muted">You will be returned to ${escapeHtml(redirect.host)}. · После входа вы вернётесь на ${escapeHtml(redirect.host)}.</p>
<form method="post" action="${CONSENT_PATH}">
<input type="hidden" name="request" value="${escapeHtml(p.request)}">
<label for="api_key">API key · API-ключ</label>
<input id="api_key" name="api_key" type="password" autocomplete="off" required autofocus>
<p class="muted">Find it at <a href="https://mobileproxy.space/user.html?api&amp;utm_source=mcp&amp;utm_medium=oauth" target="_blank" rel="noopener">mobileproxy.space → API</a>. The key is stored only inside your encrypted access token.</p>
<button type="submit">Connect · Подключить</button>
</form>
<p class="muted"><a href="${escapeHtml(cancel.href)}">Cancel · Отмена</a></p>
</main></body></html>`);
}
