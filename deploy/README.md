# Deploying the remote endpoint (mcp.mpsapi.com)

The same package runs as a remote MCP server with `--http`. It is stateless: every request
carries the user's credentials, so the server holds no API key of its own and needs no database.

Clients authenticate in one of two ways, both as `Authorization: Bearer …`:

- **Raw API key** — Claude Code, Cursor and other clients that let you set a header.
- **OAuth 2.1** — claude.ai connectors. The user signs in on a page served by this server by
  pasting their API key; the key is validated with `get_balance` and then lives only inside an
  encrypted access token (AES-256-GCM, 1 h) and refresh token (30 days). Nothing is stored
  server-side. Regenerating the API key at mobileproxy.space cuts off every token built on it.

## 1. DNS

Point `mcp.mpsapi.com` (A/AAAA record) at the server.

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
cp nginx.conf /etc/nginx/sites-available/mcp.mpsapi.com   # from this folder
ln -s /etc/nginx/sites-available/mcp.mpsapi.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d mcp.mpsapi.com --redirect             # adds TLS and the redirect
curl -s https://mcp.mpsapi.com/healthz
curl -s https://mcp.mpsapi.com/.well-known/oauth-authorization-server
```

nginx does not log request headers by default, so API keys and tokens stay out of the access log.

## 4. Verify with the live smoke test

From a checkout of this repo:

```bash
MCP_URL=https://mcp.mpsapi.com/mcp MOBILEPROXY_API_KEY=... node scripts/smoke.mjs
```

Then connect a real client:

- Claude Code:
  `claude mcp add --transport http mobileproxy https://mcp.mpsapi.com/mcp --header "Authorization: Bearer YOUR_API_KEY"`
- claude.ai: Settings → Connectors → Add custom connector → URL `https://mcp.mpsapi.com/mcp`
  → the sign-in page asks for the API key.

## 5. Announce it

`server.json` lists the endpoint under `remotes`, so every release keeps it in the MCP Registry.
If you host it somewhere else, change that URL and the README lines.

## Alternative: native Node + systemd (how mcp.mpsapi.com runs)

On a shared box where Docker would fight the existing firewall rules, run the package directly:

```bash
# Node 22 LTS from nodejs.org, checksum-verified, no apt repositories
cd /tmp && curl -fsSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
F=$(grep -oE "node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz" SHASUMS256.txt | head -1)
curl -fsSLO https://nodejs.org/dist/latest-v22.x/$F && grep " $F\$" SHASUMS256.txt | sha256sum -c -
tar -xJf $F -C /opt && ln -sfn /opt/${F%.tar.xz} /opt/node

useradd --system --user-group --no-create-home --shell /usr/sbin/nologin mcp
mkdir -p /opt/mobileproxy-mcp && cd /opt/mobileproxy-mcp && npm init -y
PATH=/opt/node/bin:$PATH npm install --omit=dev @mobileproxy/mcp-server@latest

install -m 600 mobileproxy-mcp.env.example /etc/mobileproxy-mcp.env   # then set the secret
install -m 644 mobileproxy-mcp.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now mobileproxy-mcp
```

[mobileproxy-mcp.service](mobileproxy-mcp.service) caps the process at 200 MB and half a CPU with a
lower priority, and sandboxes it (read-only system, no capabilities, no new privileges), so it
cannot starve other services on the box.

If the box already serves another HTTPS site, remember that nginx treats the first `listen 443`
block it loads as the default for requests without a matching SNI. Name the symlink so the
existing site sorts first (for example `sites-enabled/zz-mcp.mpsapi.com`), or requests to the
bare IP will start landing on the MCP server.

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
