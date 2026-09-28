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
docker build -t mobileproxy-mcp https://github.com/mobileproxy/mcp-server.git
docker run -i --rm -e MOBILEPROXY_API_KEY=your_api_key mobileproxy-mcp
```

## Быстрый старт по-русски

MCP-сервер даёт Claude, Cursor и другим AI-агентам прямое управление вашими прокси на [mobileproxy.space](https://mobileproxy.space/?utm_source=mcp&utm_medium=readme_ru): список прокси, смена IP, смена страны и оператора, баланс, покупка.

1. Возьмите API-ключ в [личном кабинете](https://mobileproxy.space/user.html?api&utm_source=mcp&utm_medium=readme_ru).
2. Установите:
   - **Claude Desktop** — скачайте `mobileproxy.mcpb` из [последнего релиза](https://github.com/mobileproxy/mcp-server/releases/latest), откройте файл двойным кликом и вставьте ключ.
   - **Claude Code** — одна команда:
     ```bash
     claude mcp add mobileproxy --scope user --env MOBILEPROXY_API_KEY=ваш_ключ -- npx -y @mobileproxy/mcp-server
     ```
3. Попросите агента обычными словами:
   - «Покажи мои прокси»
   - «Смени IP на прокси 470663 и проверь новый адрес»
   - «Перенеси прокси 470663 в Турцию»
   - «Сколько стоят 5 прокси в Германии на неделю?»

Покупки агент всегда сначала считает в режиме `estimate_only` и просит подтверждения — деньги без вашего «да» не списываются.

## Available tools

### Mobile, server and backconnect proxies

| Tool | Kind | Description |
|---|---|---|
| `list_proxies` | read | List all proxies in your account; filter by type or country (ISO code or id_country) |
| `get_proxy_status` | read | Current external IP for a proxy + optional spam-blacklist check |
| `get_balance` | read | Account balance in RUB + partner payout amount if any |
| `get_geo_list` | read | All available geo locations (geoid, ISO, free-modem count); filter by country |
| `get_price` | read | Prices across all durations (1/3/7/14/30/60/90/180/365 d) for a country |
| `rotate_ip` | mutating | Force the mobile proxy to grab a new carrier IP, with optional verify |
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
| `MOBILEPROXY_API_BASE` | `https://mobileproxy.space` | Override for dev/staging |
| `MOBILEPROXY_TIMEOUT_MS` | `30000` | HTTP request timeout |
| `MOBILEPROXY_DEBUG` | `0` | Set to `1` for verbose stderr logs |

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
