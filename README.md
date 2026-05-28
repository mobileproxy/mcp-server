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

| Tool | Description |
|---|---|
| `list_proxies` | List all proxies in your account, with optional filters by type/country |
| `get_proxy_status` | Get current external IP + optional spam-list check |
| `rotate_ip` | Force the mobile proxy to acquire a new IP from the carrier |

More tools coming in v0.2.0 (`change_geo`, `buy_proxy`, `get_balance`, `get_price`, `get_geo_list`).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MOBILEPROXY_API_KEY` | **required** | Your API token from `/user.html?api` |
| `MOBILEPROXY_API_BASE` | `https://mobileproxy.space` | Override for dev/staging |
| `MOBILEPROXY_TIMEOUT_MS` | `30000` | HTTP request timeout |
| `MOBILEPROXY_DEBUG` | `0` | Set to `1` for verbose stderr logs |

## License

MIT
