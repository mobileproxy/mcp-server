# @mobileproxy/mcp-server

Model Context Protocol server for [mobileproxy.space](https://mobileproxy.space) — gives Claude Code, Claude Desktop, Cursor, Windsurf and other MCP-compatible agents direct control over your mobile proxies.

## Quickstart

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

### Claude Code

```
claude mcp add mobileproxy \
  --command "npx -y @mobileproxy/mcp-server" \
  --env MOBILEPROXY_API_KEY=your_api_key
```

Get your API key at [mobileproxy.space/user.html?api](https://mobileproxy.space/user.html?api).

## Available tools (MVP)

| Tool | Kind | Description |
|---|---|---|
| `list_proxies` | read | List all proxies in your account; filter by type / id_country |
| `get_proxy_status` | read | Current external IP for a proxy + optional spam-blacklist check |
| `get_balance` | read | Account balance in RUB + partner payout amount if any |
| `get_geo_list` | read | All available geo locations (geoid, ISO, free-modem count); filter by country |
| `get_price` | read | Prices across all durations (1/3/7/14/30/60/90/180/365 d) for a country |
| `rotate_ip` | mutating | Force the mobile proxy to grab a new carrier IP, with optional verify |
| `change_geo` | mutating | Swap a proxy's modem to a different country/operator without re-buying |
| `buy_proxy` | **destructive** | Purchase one or more proxies — spends real balance, ask before calling |

All read tools cache geo/country lookups (5–60 min) to stay friendly with the ~3 req/sec per-token rate limit.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MOBILEPROXY_API_KEY` | **required** | Your API token from `/user.html?api` |
| `MOBILEPROXY_API_BASE` | `https://mobileproxy.space` | Override for dev/staging |
| `MOBILEPROXY_TIMEOUT_MS` | `30000` | HTTP request timeout |
| `MOBILEPROXY_DEBUG` | `0` | Set to `1` for verbose stderr logs |

## License

MIT
