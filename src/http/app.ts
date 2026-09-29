import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { MobileProxyAPI } from '../api/client.js';
import { createServer } from '../server.js';
import { VERSION } from '../version.js';
import { log } from '../utils/logger.js';
import { Sealer } from './seal.js';
import { createOAuth, createTokenVerifier } from './oauth.js';

export interface HttpAppOptions {
  /** Public origin clients use, e.g. https://mcp.mobileproxy.space. OAuth metadata is built from it. */
  publicUrl: URL;
  /** Enables the OAuth 2.1 server (needed by claude.ai connectors). Without it only raw API keys work. */
  oauthSecret?: string;
  /** Set when running behind a reverse proxy, so client IPs come from X-Forwarded-For. */
  trustProxy?: boolean;
  /** Host header values to accept; enables DNS rebinding protection when non-empty. */
  allowedHosts?: string[];
  createApi: (apiKey: string) => MobileProxyAPI;
  validateApiKey: (apiKey: string) => Promise<boolean>;
}

export function createHttpApp(o: HttpAppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (o.trustProxy) app.set('trust proxy', 1);

  const mcpUrl = new URL('/mcp', o.publicUrl);
  const sealer = o.oauthSecret ? new Sealer(o.oauthSecret) : undefined;
  const verifier = createTokenVerifier(sealer);
  let resourceMetadataUrl: string | undefined;

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', version: VERSION, oauth: Boolean(sealer) });
  });

  if (sealer) {
    const oauth = createOAuth({ sealer, verifier, validateApiKey: o.validateApiKey });
    app.post(oauth.consentPath, express.urlencoded({ extended: false, limit: '16kb' }), oauth.consentHandler);
    app.use(
      mcpAuthRouter({
        provider: oauth.provider,
        issuerUrl: o.publicUrl,
        resourceServerUrl: mcpUrl,
        resourceName: 'MobileProxy',
        serviceDocumentationUrl: new URL('https://github.com/mobileproxy/mcp-server'),
        clientRegistrationOptions: { clientIdGeneration: false },
      }),
    );
    resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);
  }

  /* One API client per key keeps the reference-data caches warm across stateless requests. */
  const apis = new Map<string, MobileProxyAPI>();
  const apiFor = (key: string): MobileProxyAPI => {
    let api = apis.get(key);
    if (api) {
      apis.delete(key);
    } else {
      api = o.createApi(key);
      if (apis.size >= 500) apis.delete(apis.keys().next().value!);
    }
    apis.set(key, api);
    return api;
  };

  app.post('/mcp', requireBearerAuth({ verifier, resourceMetadataUrl }), express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
    const server = createServer(apiFor(String(req.auth?.extra?.apiKey)), { local: false });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      ...(o.allowedHosts?.length ? { enableDnsRebindingProtection: true, allowedHosts: o.allowedHosts } : {}),
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error('MCP request failed:', err instanceof Error ? err.message : String(err));
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  const statelessOnly = (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'This server is stateless: send JSON-RPC requests with POST.' },
      id: null,
    });
  };
  app.get('/mcp', statelessOnly);
  app.delete('/mcp', statelessOnly);

  return app;
}
