# Deploying the remote endpoint (mcp.mobileproxy.space)

The same package runs as a remote MCP server with `--http`. It is stateless: every request
carries the user's credentials, so the server holds no API key of its own and needs no database.

Clients authenticate in one of two ways, both as `Authorization: Bearer …`:

- **Raw API key** — Claude Code, Cursor and other clients that let you set a header.
- **OAuth 2.1** — claude.ai connectors. The user signs in on a page served by this server by
  pasting their API key; the key is validated with `get_balance` and then lives only inside an
  encrypted access token (AES-256-GCM, 1 h) and refresh token (30 days). Nothing is stored
  server-side. Regenerating the API key at mobileproxy.space cuts off every token built on it.

## 1. DNS

Point `mcp.mobileproxy.space` (A/AAAA record) at the server.

## 2. Container

```bash
mkdir -p /opt/mobileproxy-mcp && cd /opt/mobileproxy-mcp
curl -fsSLO https://raw.githubusercontent.com/mobileproxy/mcp-server/main/deploy/docker-compose.yml
echo "MOBILEPROXY_OAUTH_SECRET=$(openssl rand -hex 32)" > .env
chmod 600 .env
docker compose up -d
curl -s http://127.0.0.1:8080/healthz      # {"status":"ok","version":"…","oauth":true}
```

Keep `MOBILEPROXY_OAUTH_SECRET` stable: changing it signs everyone out of claude.ai connectors.

## 3. nginx + TLS

`nginx.conf` here is HTTP-only on purpose: a 443 block that points at a certificate which
doesn't exist yet would make `nginx -t` fail before certbot can issue it.

```bash
cp nginx.conf /etc/nginx/sites-available/mcp.mobileproxy.space   # from this folder
ln -s /etc/nginx/sites-available/mcp.mobileproxy.space /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d mcp.mobileproxy.space --redirect             # adds TLS and the redirect
curl -s https://mcp.mobileproxy.space/healthz
curl -s https://mcp.mobileproxy.space/.well-known/oauth-authorization-server
```

nginx does not log request headers by default, so API keys and tokens stay out of the access log.

## 4. Verify with the live smoke test

From a checkout of this repo:

```bash
MCP_URL=https://mcp.mobileproxy.space/mcp MOBILEPROXY_API_KEY=... node scripts/smoke.mjs
```

Then connect a real client:

- Claude Code:
  `claude mcp add --transport http mobileproxy https://mcp.mobileproxy.space/mcp --header "Authorization: Bearer YOUR_API_KEY"`
- claude.ai: Settings → Connectors → Add custom connector → URL `https://mcp.mobileproxy.space/mcp`
  → the sign-in page asks for the API key.

## 5. Announce it

Once the endpoint works, add it to `server.json` and cut a release so the MCP Registry lists it:

```json
"remotes": [{ "type": "streamable-http", "url": "https://mcp.mobileproxy.space/mcp" }]
```

and add the remote setup lines to the main README.

## Updating

```bash
cd /opt/mobileproxy-mcp && docker compose pull && docker compose up -d
```

## Environment reference

| Variable | Default | Purpose |
|---|---|---|
| `MOBILEPROXY_TRANSPORT` / `--http` | stdio | `http` starts the remote server |
| `PORT` / `HOST` | `8080` / `127.0.0.1` | Listen address (`0.0.0.0` inside Docker) |
| `MOBILEPROXY_PUBLIC_URL` | `http://localhost:PORT` | Public origin; OAuth metadata and the allowed Host header come from it |
| `MOBILEPROXY_OAUTH_SECRET` | unset | ≥32 chars; enables OAuth. Without it only raw API keys are accepted |
| `MOBILEPROXY_TRUST_PROXY` | unset | `1` behind nginx, so rate limits see real client IPs |

`attach_proxy_to_adspower` is not offered on the remote endpoint: it needs AdsPower on the user's own computer.
