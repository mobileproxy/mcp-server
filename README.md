# @mobileproxy/mcp-server

[![npm](https://img.shields.io/npm/v/@mobileproxy/mcp-server)](https://www.npmjs.com/package/@mobileproxy/mcp-server)
[![downloads](https://img.shields.io/npm/dm/@mobileproxy/mcp-server)](https://www.npmjs.com/package/@mobileproxy/mcp-server)
[![license](https://img.shields.io/github/license/mobileproxy/mcp-server)](LICENSE)

Model Context Protocol server for [mobileproxy.space](https://mobileproxy.space/?utm_source=mcp&utm_medium=readme) — gives Claude Code, Claude Desktop, Cursor, Windsurf and other MCP-compatible agents direct control over your mobile proxies.

Every mobile proxy is a dedicated 4G/LTE modem with a real carrier IP. One account keeps one stable IP for as long as you need, and you rotate it on demand. That makes it a fit for multi-account management, anti-detect browser profiles and ad verification, where a shared residential pool would swap the IP mid-session.

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

The hosted endpoint `https://mcp.mpsapi.com/mcp` runs the same tools (except the local-only AdsPower bridge):

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

### Agent workflows

One call for what otherwise takes a chain of the tools below. Agents pick these first.

| Tool | Kind | Description |
|---|---|---|
| `get_health_snapshot` | read | What needs attention: expiring proxies (with auto-renewal state), residential packages low on traffic, optionally blacklisted IPs |
| `find_available_geo` | read | Where free modems are in a country or city, which operators have them, and prices per period |
| `get_connection_string` | read | `http://` / `socks5://` URLs, a `host:port:login:password` line for AdsPower, Dolphin Anty, Multilogin, GoLogin, a curl test, and the change-IP link |
| `rotate_until_clean` | mutating | Rotate a mobile proxy until its IP is on no spam blacklist; `keep_if_clean` keeps a good current IP |
| `attach_proxy_to_adspower` | **destructive** | Write a proxy (and the change-IP link) straight into an AdsPower profile — *experimental, local only* |

### TCP fingerprint (mobile and server proxies)

Anti-fraud systems compare the OS your browser claims with the OS its TCP/IP packets reveal
(TTL, window, MSS, option order). These tools make the proxy's network-level signature match the
anti-detect browser profile.

| Tool | Kind | Description |
|---|---|---|
| `list_tcp_profiles` | read | Presets to imitate: Android, iPhone, Windows, macOS, Linux… |
| `get_tcp_fingerprint` | read | Which profile each proxy currently imitates (null = native) |
| `set_tcp_fingerprint` | mutating | Apply a profile to up to 50 proxies; `profile_id=0` restores native. Reaches the equipment within a minute |
| `diagnose_tcp_fingerprint` | read | What fingerprinting sites actually observe through the proxy vs. the applied profile (up to ~45 s) |

`attach_proxy_to_adspower` talks to the [AdsPower Local API](https://localapi-doc-en.adspower.com/) on your computer, so AdsPower must be running with its Local API enabled. It is built from AdsPower's API documentation and covered by tests, but not yet verified against a live AdsPower install — please report problems in Issues.

### Mobile, server and backconnect proxies

| Tool | Kind | Description |
|---|---|---|
| `list_proxies` | read | List all proxies in your account; filter by type or country (ISO code or id_country) |
| `get_proxy_status` | read | Current external IP for a proxy + optional spam-blacklist check |
| `get_balance` | read | Account balance in RUB + partner payout amount if any |
| `get_geo_list` | read | All available geo locations (geoid, ISO, free-modem count); filter by country |
| `get_price` | read | Prices across all durations (1/3/7/14/30/60/90/180/365 d) for a country |
| `rotate_ip` | mutating | New exit IP: mobile proxies reconnect to the carrier; sticky residential proxies get a new peer. Optional verify |
| `change_geo` | mutating | Swap a proxy's modem to a different country/operator without re-buying |
| `buy_proxy` | **destructive** | Purchase one or more proxies — spends real balance, ask before calling |

### Residential proxies (type 3)

Residential is billed **by traffic volume**, not by rental period — so it has its own
plan/geo/top-up tools instead of reusing `get_price` and `buy_proxy`.

| Tool | Kind | Description |
|---|---|---|
| `list_residential_plans` | read | GB bundles with price per GB; use instead of `get_price` |
| `get_residential_locations` | read | Countries / regions / cities / ASNs valid for geo targeting |
| `get_residential_traffic` | read | Daily consumption + burn rate for a residential proxy |
| `set_residential_geo` | mutating | Read or change geo targeting and rotating/sticky mode — free and reversible |
| `buy_residential` | **destructive** | Buy a traffic bundle — spends real balance |
| `add_residential_traffic` | **destructive** | Top up an existing package, keeping its geo and connection string |

Notes on residential:

- Geo codes must come from `get_residential_locations`. An unknown value is silently
  dropped by the backend, leaving the proxy in its previous location.
- Changing geo rewrites the provider login, so re-read `http`/`socks5` from the response.
- Both purchase tools support `estimate_only: true` as a built-in dry run.
- In `list_proxies` a residential entry has `proxy_type: 3`, both ports equal (one port
  serves HTTP and SOCKS5), no squid fields, and a `residential_traffic_*` quota block.

All read tools cache geo/country lookups (5–60 min) to stay friendly with the ~3 req/sec per-token rate limit.

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

## Links

- [Install guide](docs/INSTALL.md)
- [Publishing runbook](docs/PUBLISH.md)
- [MCP Registry entry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.mobileproxy/mcp-server)
- [Model Context Protocol](https://modelcontextprotocol.io)

## License

MIT
