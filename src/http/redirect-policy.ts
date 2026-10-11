/**
 * Redirect URI policy for OAuth clients that register themselves through open Dynamic Client
 * Registration (RFC 7591). Registration has to stay open — MCP clients such as Claude, ChatGPT
 * and Cursor rely on it — so the guards live here instead:
 *
 *  - registration and authorization accept only https, plain http on a loopback address, and
 *    private-use schemes of native apps (RFC 8252 §7.1, e.g. cursor://). Schemes that a browser
 *    would execute or read locally (javascript:, data:, file:, …) and http to remote hosts are refused;
 *  - the consent page tells the user when the return address does not belong to a known MCP client,
 *    because the client name is chosen by whoever registered the client.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Schemes that must never receive an authorization code. */
const FORBIDDEN_SCHEMES = new Set([
  'http', 'https', // handled separately
  'javascript', 'vbscript', 'data', 'blob', 'file', 'filesystem', 'about', 'view-source',
  'ftp', 'ws', 'wss', 'intent', 'chrome', 'chrome-extension', 'moz-extension',
]);

/** Return hosts of MCP clients we recognise. Matched exactly, subdomains are not included. */
export const DEFAULT_TRUSTED_REDIRECT_HOSTS = [
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  'vscode.dev',
  'insiders.vscode.dev',
];

/** Private-use schemes of desktop MCP clients we recognise. */
const TRUSTED_APP_SCHEMES = new Set(['cursor', 'vscode', 'vscode-insiders']);

function parse(uri: string): URL | undefined {
  try {
    return new URL(uri);
  } catch {
    return undefined;
  }
}

const schemeOf = (u: URL) => u.protocol.replace(/:$/, '').toLowerCase();

/** Why a redirect URI is not acceptable, or undefined when it is. */
export function redirectUriProblem(uri: string): string | undefined {
  const u = parse(uri);
  if (!u) return 'redirect_uri is not a valid absolute URI';
  if (u.hash) return 'redirect_uri must not contain a fragment';
  const scheme = schemeOf(u);
  if (scheme === 'https') return u.hostname ? undefined : 'redirect_uri must have a host';
  if (scheme === 'http') {
    return LOOPBACK_HOSTS.has(u.hostname.toLowerCase())
      ? undefined
      : 'http redirect_uri is allowed only for loopback addresses (localhost, 127.0.0.1, [::1]); use https';
  }
  if (FORBIDDEN_SCHEMES.has(scheme) || !/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    return `redirect_uri scheme "${scheme}" is not allowed`;
  }
  return undefined; // private-use scheme of a native app
}

export interface RedirectTrust {
  /** True for a known MCP client or a local app (loopback / known app scheme). */
  known: boolean;
  /** What to show the user: host for web redirects, "scheme://" for native apps. */
  display: string;
}

export function classifyRedirect(uri: string, trustedHosts: readonly string[] = DEFAULT_TRUSTED_REDIRECT_HOSTS): RedirectTrust {
  const u = parse(uri);
  if (!u) return { known: false, display: uri };
  const scheme = schemeOf(u);
  if (scheme === 'http' || scheme === 'https') {
    const host = u.hostname.toLowerCase();
    const known = LOOPBACK_HOSTS.has(host) || trustedHosts.some((h) => h.toLowerCase() === host);
    return { known, display: u.host };
  }
  return { known: TRUSTED_APP_SCHEMES.has(scheme), display: `${scheme}://${u.host}` };
}

/** Parses MOBILEPROXY_TRUSTED_REDIRECT_HOSTS: comma-separated hosts added to the defaults. */
export function trustedHostsFromEnv(value: string | undefined): string[] {
  const extra = (value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+$/.test(h));
  return [...new Set([...DEFAULT_TRUSTED_REDIRECT_HOSTS, ...extra])];
}
