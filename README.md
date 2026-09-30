# @mobileproxy/mcp-server

[![npm](https://img.shields.io/npm/v/@mobileproxy/mcp-server)](https://www.npmjs.com/package/@mobileproxy/mcp-server)
[![downloads](https://img.shields.io/npm/dm/@mobileproxy/mcp-server)](https://www.npmjs.com/package/@mobileproxy/mcp-server)
[![license](https://img.shields.io/github/license/mobileproxy/mcp-server)](LICENSE)

Model Context Protocol server for [mobileproxy.space](https://mobileproxy.space/?utm_source=mcp&utm_medium=readme) — gives Claude Code, Claude Desktop, Cursor, Windsurf and other MCP-compatible agents direct control over your mobile proxies.

Every mobile proxy is a dedicated 4G/LTE modem with a real carrier IP that stays yours for as long as you need, and you rotate it on demand. Typical uses: testing sites and apps the way mobile users in a given country and network see them, checking ads and localized content by geo, price and availability monitoring, and keeping your own traffic private.

## Quickstart

Get your API key at [mobileproxy.space/user.html?api](https://mobileproxy.space/user.html?api&utm_source=mcp&utm_medium=readme).

### Claude Desktop — one click

Download `mobileproxy.mcpb` from the [latest release](https://github.com/mobileproxy/mcp-server/releases/latest), double-click it, paste your API key. Claude Desktop ships its own Node.js, nothing else to install.

### Claude Code

```bash
claude mcp add mobileproxy --scope user --env MOBILEPROXY_API_KEY=your_api_key -- npx -y @mobileproxy/mcp-server
```

`--scope user` stores the key in your user config, not in the project, so it never ends up in git.

### Remote server — nothing to install

The hosted endpoint `https://mcp.mpsapi.com/mcp` runs the same tools, with two differences: it leaves out the local-only AdsPower bridge, and it quotes purchases, renewals and top-ups instead of charging the balance (`quote_proxy_purchase`, `quote_renewal`, `quote_residential_purchase`, `quote_residential_topup` return the amount and a dashboard link). Install the package locally to buy from the chat.

- **claude.ai:** Settings → Connectors → Add custom connector → URL `https://mcp.mpsapi.com/mcp` → paste your API key on the sign-in page.
- **Claude Code:**
  ```bash
  claude mcp add --transport http mobileproxy https://mcp.mpsapi.com/mcp --header "Authorization: Bearer your_api_key"
  ```
- **Cursor:** `{"mcpServers": {"mobileproxy": {"url": "https://mcp.mpsapi.com/mcp", "headers": {"Authorization": "Bearer your_api_key"}}}}`

The server keeps no copy of your key: each request carries it, or an OAuth token that contains it encrypted.

### Cursor, Windsurf, Claude Desktop (manual JSON)

```json
{
  "mcpServers": {
    "mobileproxy": {
      "command": "npx",
      "args": ["-y", "@mobileproxy/mcp-server"],
      "env": {
        "MOBILEPROXY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Cursor: `~/.cursor/mcp.json`.

### Docker

```bash
docker run -i --rm -e MOBILEPROXY_API_KEY=your_api_key ghcr.io/mobileproxy/mcp-server
```

In an MCP client config use `"command": "docker"` with `"args": ["run", "-i", "--rm", "-e", "MOBILEPROXY_API_KEY", "ghcr.io/mobileproxy/mcp-server"]`.

## Быстрый старт по-русски

MCP-сервер даёт Claude, Cursor и другим AI-агентам прямое управление вашими прокси на [mobileproxy.space](https://mobileproxy.space/?utm_source=mcp&utm_medium=readme_ru): список прокси, смена IP, смена страны и оператора, баланс, покупка.

1. Возьмите API-ключ в [личном кабинете](https://mobileproxy.space/user.html?api&utm_source=mcp&utm_medium=readme_ru).
2. Установите:
   - **Claude Desktop** — скачайте `mobileproxy.mcpb` из [последнего релиза](https://github.com/mobileproxy/mcp-server/releases/latest), откройте файл двойным кликом и вставьте ключ.
   - **Claude Code** — одна команда:
     ```bash
     claude mcp add mobileproxy --scope user --env MOBILEPROXY_API_KEY=ваш_ключ -- npx -y @mobileproxy/mcp-server
     ```
   - **Без установки** — удалённый сервер `https://mcp.mpsapi.com/mcp`: в claude.ai добавьте его как коннектор (ключ вводится на странице входа), в Claude Code — `claude mcp add --transport http mobileproxy https://mcp.mpsapi.com/mcp --header "Authorization: Bearer ваш_ключ"`.
3. Попросите агента обычными словами:
   - «Всё ли в порядке с моими прокси?»
   - «Дай строку для импорта прокси 470663 в AdsPower»
   - «Смени IP на прокси 470663, пока не будет чистый»
   - «Где в Казани есть свободные модемы Мегафона и сколько это стоит?»
   - «Пропиши прокси 470663 в профиль AdsPower jc8y5g3» (AdsPower должен быть запущен)
   - «Поставь прокси 470663 TCP-отпечаток Windows 11 и проверь, что видят сайты»
   - «Перенеси прокси 470663 в Турцию»
   - «Сколько стоят 5 прокси в Германии на неделю?»

Покупки агент всегда сначала считает в режиме `estimate_only` и просит подтверждения — деньги без вашего «да» не списываются.

## Available tools

**read** tools only look things up. **write** tools change something — a proxy, its settings or the balance — and are annotated as destructive, so MCP clients such as Claude ask before running them. Purchase tools (local build only) also take `estimate_only: true` for a dry run.

### Account and proxies

| Tool | Kind | Description |
|---|---|---|
| `get_health_snapshot` | read | What needs attention: expiring proxies (with auto-renewal state), residential packages low on traffic, optionally blacklisted IPs |
| `list_proxies` | read | All proxies with connection details; filter by type or country |
| `get_proxy_status` | read | Current external IP of a proxy + optional spam-blacklist check |
| `get_connection_string` | read | `http://` / `socks5://` URLs, a `host:port:login:password` import line, a curl test, and the change-IP link |
| `get_balance` | read | Balance in RUB + partner payout amount if any |
| `get_account_history` | read | Top-ups, purchases, renewals and refunds with receipt links |
| `update_proxy_settings` | write | Auto-renewal, comment and automatic IP-rotation timer for up to 100 proxies at once |
| `change_proxy_credentials` | write | New login and password for up to 50 proxies, e.g. after a leak |
| `reboot_modem` | write | Power-cycle the modem behind a stuck mobile proxy (once per 30 min) |

### Mobile, server and backconnect proxies

| Tool | Kind | Description |
|---|---|---|
| `find_available_geo` | read | Free modems in a country or city, operators that have them, and prices per period — in one call |
| `get_geo_list` | read | All locations (geoid, ISO, free-modem count); filter by country |
| `get_price` | read | Prices for every rental period (1/3/7/14/30/60/90/180/365 d) in a country |
| `rotate_ip` | write | New exit IP: mobile proxies reconnect to the carrier; sticky residential proxies get a new peer |
| `rotate_until_clean` | write | Rotate a mobile proxy until its IP is on no spam blacklist; `keep_if_clean` keeps a good current IP |
| `change_geo` | write | Move a proxy to another country or operator without re-buying |
| `buy_proxy` | write | Buy proxies — charges the balance (hosted: `quote_proxy_purchase`) |
| `renew_proxies` | write | Extend up to 100 proxies by a period — charges the balance (hosted: `quote_renewal`) |

### TCP fingerprint (mobile and server proxies)

Sets the OS signature a proxy shows at the network level (TTL, window, MSS, TCP option order), so
proxied traffic looks like the device it represents — for example a Windows desktop or an iPhone.

| Tool | Kind | Description |
|---|---|---|
| `list_tcp_profiles` | read | Presets: Android, iPhone, Windows, macOS, Linux… |
| `get_tcp_fingerprint` | read | Which profile each proxy currently presents (null = native) |
| `set_tcp_fingerprint` | write | Apply a profile to up to 50 proxies; `profile_id=0` restores native. Reaches the equipment within a minute |
| `diagnose_tcp_fingerprint` | read | What fingerprinting endpoints observe through the proxy vs. the applied profile (up to ~45 s) |

### Residential proxies (type 3)

Residential is billed **by traffic volume**, not by rental period, so it has its own
plan, geo and top-up tools.

| Tool | Kind | Description |
|---|---|---|
| `list_residential_plans` | read | GB bundles with price per GB |
| `get_residential_locations` | read | Countries / regions / cities / ASNs valid for geo targeting |
| `get_residential_traffic` | read | Daily consumption and burn rate |
| `set_residential_geo` | write | Read or change geo targeting and rotating/sticky mode — free and reversible |
| `buy_residential` | write | Buy a traffic bundle — charges the balance (hosted: `quote_residential_purchase`) |
| `add_residential_traffic` | write | Top up a package, keeping its geo and connection string (hosted: `quote_residential_topup`) |

Notes on residential:

- Geo codes come from `get_residential_locations`. The backend ignores unknown values and
  leaves the proxy in its previous location.
- Changing geo rewrites the provider login; the response carries the new `http`/`socks5` strings.
- In `list_proxies` a residential entry has `proxy_type: 3`, both ports equal (one port
  serves HTTP and SOCKS5), and a `residential_traffic_*` quota block.

### Local integrations

| Tool | Kind | Description |
|---|---|---|
| `attach_proxy_to_adspower` | write | Write a proxy (and the change-IP link) into an AdsPower browser profile — *experimental, local build only* |

`attach_proxy_to_adspower` talks to the [AdsPower Local API](https://localapi-doc-en.adspower.com/) on your computer, so AdsPower must be running with its Local API enabled. It is built from AdsPower's API documentation and covered by tests, but not yet verified against a live AdsPower install — please report problems in Issues.

Read tools cache geo and country lookups (5–60 min) to stay within the ~3 requests/sec per-token rate limit.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MOBILEPROXY_API_KEY` | **required** | Your API token from `/user.html?api` |
| `MOBILEPROXY_API_BASE` | `https://mpsapi.com` | API portal, reachable from Russia too; override for dev/staging |
| `MOBILEPROXY_TIMEOUT_MS` | `30000` | HTTP request timeout |
| `MOBILEPROXY_DEBUG` | `0` | Set to `1` for verbose stderr logs |
| `ADSPOWER_API_URL` | `http://local.adspower.net:50325` | AdsPower Local API address, for `attach_proxy_to_adspower` |
| `ADSPOWER_API_KEY` | unset | Only if AdsPower's Local API has security verification on |

### Running as a remote HTTP server

`npx -y @mobileproxy/mcp-server --http` (or the Docker image with `--http`) serves MCP over
Streamable HTTP at `/mcp`. It is stateless and holds no key of its own: clients send their
API key as `Authorization: Bearer …`, and with `MOBILEPROXY_OAUTH_SECRET` set it also acts as an
OAuth 2.1 server for claude.ai connectors. See [deploy/README.md](deploy/README.md) for the
Docker + nginx setup and every setting.

## Client compatibility

| Client | Supported | Notes |
|---|---|---|
| Claude Desktop | ✅ | one-click `.mcpb`, or the JSON block above |
| Claude Code CLI | ✅ | `claude mcp add ... --scope user`; `${env:VAR}` also works in `.mcp.json` |
| Cursor | ✅ | hard-code env in config (no substitution) |
| Windsurf | ✅ | as Cursor |
| Cowork / CCD | ⚠️ | `${env:VAR}` is **not** substituted — use user-scope config or a system-wide env var |

See [docs/INSTALL.md](docs/INSTALL.md) for per-client setup and troubleshooting.

## Privacy

This server is a thin client for the mobileproxy.space API; it adds no tracking of its own.

- **What it processes:** your mobileproxy.space API key and the parameters of each tool call, which it forwards to the mobileproxy.space API (`mpsapi.com`) to act on your account. It does not read or store your conversations, prompts or files.
- **Local install (npm, `.mcpb`, Docker):** everything runs on your computer. The key stays in your MCP client's configuration or your OS keychain.
- **Hosted endpoint (`mcp.mpsapi.com`):** no database and no copy of your key. Each request carries the key, or an OAuth access token that contains it encrypted (AES-256-GCM; access tokens expire after 1 hour, refresh tokens after 30 days). The web server keeps standard access logs — time, client IP, request line, status, referrer and user agent; never request bodies or the `Authorization` header — for troubleshooting and abuse prevention, deleted after 14 days.
- **Third parties:** none. Requests go only to the mobileproxy.space API; the optional AdsPower bridge talks to AdsPower on your own computer.
- **Revoking access:** remove the connector in your client, or regenerate the API key at [mobileproxy.space/user.html?api](https://mobileproxy.space/user.html?api), which invalidates every token built on the old key.
- **Full policy:** the mobileproxy.space [Privacy Policy](https://mobileproxy.space/en/privacypolicy.html) covers account data. Questions: support at [mobileproxy.space](https://mobileproxy.space/?utm_source=mcp&utm_medium=readme) or [GitHub issues](https://github.com/mobileproxy/mcp-server/issues).

## Links

- [Install guide](docs/INSTALL.md)
- [Publishing runbook](docs/PUBLISH.md)
- [MCP Registry entry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.mobileproxy/mcp-server)
- [Model Context Protocol](https://modelcontextprotocol.io)

## License

MIT
