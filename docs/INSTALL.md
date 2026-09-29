# Installation & wiring up

The MCP server is a regular Node program that talks over stdio. Any MCP-aware
agent (Claude Code, Claude Desktop, Cursor, Windsurf, custom) runs it as a
child process. Get your API key at
https://mobileproxy.space/user.html?api&utm_source=mcp&utm_medium=docs

## Claude Desktop — one click (recommended)

1. Download `mobileproxy.mcpb` from the
   [latest release](https://github.com/mobileproxy/mcp-server/releases/latest).
2. Double-click it (or drag it into Settings → Extensions).
3. Paste your API key into the field Claude Desktop shows. It is stored in the
   OS keychain, not in a plain config file.

Claude Desktop bundles its own Node.js, so nothing else needs to be installed.

### Claude Desktop — manual JSON

Merge the `mcpServers` block from [examples/claude-desktop.json](examples/claude-desktop.json)
into `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS),
replace `YOUR_API_KEY_HERE`, then fully quit and relaunch Claude Desktop
(from the tray / menu bar, not just the window). Requires Node.js 20+.

## Claude Code

Personal setup — the key goes into your user config, never into a repo:

```bash
claude mcp add mobileproxy --scope user --env MOBILEPROXY_API_KEY=your_key -- npx -y @mobileproxy/mcp-server
```

Team setup — commit a `.mcp.json` like [examples/claude-code.json](examples/claude-code.json).
It reads the key from each developer's environment via `${env:MOBILEPROXY_API_KEY}`:

```powershell
# PowerShell — permanent for the current user
[Environment]::SetEnvironmentVariable('MOBILEPROXY_API_KEY', 'your_key', 'User')
```

```bash
# bash / zsh — add to ~/.bashrc or ~/.zshrc
export MOBILEPROXY_API_KEY=your_key
```

Start a fresh `claude` session afterwards; it asks to approve the server on first run.

## Cursor / Windsurf

See [examples/cursor.json](examples/cursor.json). The file lives at `~/.cursor/mcp.json`
(global) or `.cursor/mcp.json` (per workspace). These clients don't substitute
`${env:...}`, so the key is written into the file — keep it out of git.

## Local development

```bash
npm ci
npm run build          # compiles src/ into dist/
npm run inspector      # MCP Inspector UI against dist/index.js
```

This repo ships a `.mcp.json` that runs `./dist/index.js`, so `claude` started
from the repo root attaches the local build for self-testing.

Remote mode locally: `node dist/index.js --http` listens on `http://localhost:8080/mcp`;
`MCP_URL=http://localhost:8080/mcp npm run smoke` runs the live checks over HTTP.
Deployment: [deploy/README.md](../deploy/README.md).

## Verifying

Once attached, try these prompts:

- *"List my proxies."* → `list_proxies`
- *"What's my balance?"* → `get_balance`
- *"How much would 5 proxies in Germany for a week cost?"* → `get_price` with `country: "DE"`
- *"Rotate the IP on proxy 470663 and confirm the new IP."* → `rotate_ip` with `verify: true`
- *"Swap proxy 470663 to Turkey."* → `change_geo` with `country: "TR"` (the agent should ask first)
- *"Which residential plans do you have and what's the price per GB?"* → `list_residential_plans`
- *"Is everything OK with my proxies?"* → `get_health_snapshot`
- *"Where in Kazan are free MegaFon modems and what do they cost?"* → `find_available_geo`
- *"Give me proxy 470663 in a format for AdsPower import."* → `get_connection_string`
- *"Get proxy 470663 a clean IP before I log in."* → `rotate_until_clean`
- *"Put proxy 470663 into AdsPower profile jc8y5g3."* → `attach_proxy_to_adspower` (AdsPower must be running; the agent should ask first)
- *"Покажи мои прокси и смени IP на первом мобильном."* → `list_proxies`, then `rotate_ip`

If the agent reaches for a different tool, or asks for info it should work out
from the descriptions, tighten that tool's `description` and rebuild.

## Caveats by client

| Client | `${env:VAR}` in env block | Approval prompt | Picks up config changes |
|---|---|---|---|
| Claude Code CLI | ✅ substituted | yes | restart session |
| Cowork / CCD UI | ❌ passed literally | silent in Auto-mode | restart on close-session |
| Claude Desktop (classic) | depends on version | yes | restart app |
| Cursor / Windsurf | ❌ | yes | restart app |

**Cowork / CCD:** because `${env:...}` arrives literally, either register the
server with `claude mcp add --scope user` (key in your user config), or set the
variable system-wide and **fully quit and relaunch** the app — the variable must
exist before the app starts. Don't paste the key into a project `.mcp.json`:
that file is committed.

## Troubleshooting

- **`MOBILEPROXY_API_KEY environment variable is required`** in stderr →
  the env block isn't reaching the child process. See the Cowork note above.
- **`API key missing or invalid`** while the key is set → the client passed the
  literal string `${env:MOBILEPROXY_API_KEY}`; same fix.
- **`Authorization error #4`** → your API token is IP-restricted and this
  machine isn't in the allowlist. Edit the token at
  https://mobileproxy.space/user.html?api .
- **Tool list empty** → run `node dist/index.js` (or `npx -y @mobileproxy/mcp-server`)
  manually to see startup errors in stderr; the MCP transport sometimes swallows them.
- **`IP rotation failed: ...wait N seconds`** → rotation has a per-proxy
  cooldown. Try again after the suggested delay.
