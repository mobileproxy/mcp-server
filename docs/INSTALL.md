# Installation & wiring up

The MCP server is a regular Node program that listens on stdio. Any MCP-aware
agent (Claude Code, Claude Desktop, Cursor, Windsurf, custom) can run it as a
child process and exchange tool calls over stdio.

## Local development (no npm publish yet)

```powershell
cd C:\Users\m\Downloads\Proxy\mobileproxy-mcp-server
node node_modules\typescript\bin\tsc   # build into dist/
```

Then point your client at `dist/index.js` — see `docs/examples/`.

## Claude Code — per-project

1. Copy `docs/examples/claude-code.json` to the root of the project where you
   want mobileproxy tools available, save it as `.mcp.json`.
2. Set the API key once in your shell so the `${env:...}` substitution works:
   ```powershell
   # PowerShell — make it permanent in $PROFILE
   [Environment]::SetEnvironmentVariable('MOBILEPROXY_API_KEY', 'your_key', 'User')
   ```
3. Start a fresh `claude` session in that folder. Claude Code prompts to
   approve the MCP server on first run.

This repo ships its own `.mcp.json` at the root — run `claude` from
`mobileproxy-mcp-server/` and the server is auto-attached for self-testing.

## Claude Desktop — global

1. Open `%APPDATA%\Claude\claude_desktop_config.json` (create it if missing).
2. Merge the `mcpServers` block from `docs/examples/claude-desktop.json` —
   keep any servers you already have configured.
3. Replace `YOUR_API_KEY_HERE` with your real token. (Claude Desktop only
   recently started supporting `${env:...}` substitution; if it doesn't work
   on your version, hard-code the key.)
4. Fully restart Claude Desktop (quit from the system tray, not just close
   the window).

## Cursor

See `docs/examples/cursor.json` — same pattern, file lives at
`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-workspace).

## Verifying

Once attached, try these prompts:

- *"List my proxies."* → expect `list_proxies`
- *"What's my balance?"* → expect `get_balance`
- *"How much would 5 proxies in Germany for a week cost?"* → expect
  `get_price` (with `country: "DE"`, then maybe `get_geo_list` for context)
- *"Rotate the IP on proxy 470663 and confirm the new IP."* → expect
  `rotate_ip` with `verify: true`
- *"Swap proxy 470663 to Turkey."* → expect `change_geo` with
  `country: "TR"` (the agent should ask for confirmation since it mutates)

If the agent reaches for a different tool or asks for clarifying info you'd
expect it to figure out from the descriptions, that's a signal to tighten
the tool's `description` text and rebuild.

## Troubleshooting

- **`MOBILEPROXY_API_KEY environment variable is required`** in stderr →
  the env block isn't reaching the child process. Check your client's
  config file syntax.
- **`Authorization error #4`** → your API token is IP-restricted and the
  machine running this server isn't in the allowlist. Edit the token at
  https://mobileproxy.space/user.html?api .
- **Tool list empty** → run `node dist/index.js` manually to see startup
  errors in stderr; the MCP transport sometimes swallows them.
