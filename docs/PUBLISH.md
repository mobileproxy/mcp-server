# Publishing runbook

Pushing a `v*` tag runs [.github/workflows/publish.yml](../.github/workflows/publish.yml):

1. **publish** — checks that the tag matches every version field, builds, runs tests,
   publishes to npm with provenance (OIDC trusted publishing, no `NPM_TOKEN`).
2. **registry** — publishes `server.json` to the official MCP Registry (GitHub OIDC,
   no secret). Runs after npm because the registry checks the npm package's `mcpName`.
3. **mcpb** — builds `mobileproxy.mcpb` (Claude Desktop one-click bundle) and attaches it
   to a GitHub Release with generated notes.
4. **docker** — pushes `ghcr.io/mobileproxy/mcp-server:<version>` and `:latest`.

## One-time setup

- **npm trusted publishing:** npmjs.com → package settings → Trusted Publishing →
  add publisher: org `mobileproxy`, repo `mcp-server`, workflow `publish.yml`.
- **MCP Registry:** nothing to configure. The `io.github.mobileproxy/*` namespace is
  proven by the workflow running in the `mobileproxy/mcp-server` repo.
- **Glama:** `glama.json` in the repo root lists the maintainer (`mobileproxy`). Sign in
  to glama.ai with that GitHub account and claim the listing.
- **GHCR:** after the first image is pushed, open github.com/users/mobileproxy/packages →
  `mcp-server` → Package settings → Change visibility → **Public**. New container packages
  start private, and `docker run ghcr.io/mobileproxy/mcp-server` fails for everyone else until then.

## Each release

The version lives in four places: `package.json`, `server.json` (`version` and
`packages[0].version`) and `manifest.json`. `npm version` keeps them in sync through
the `version` script hook, and CI refuses a tag that doesn't match.

```bash
npm version minor            # bumps package.json, syncs server.json + manifest.json,
                             # commits and creates tag vX.Y.0
git push --follow-tags       # triggers the release workflow
```

Check the result after ~2 minutes:

```bash
npm view @mobileproxy/mcp-server version
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.mobileproxy/mcp-server"
gh release view --json assets
```

Before tagging a release that touches API calls, run the live smoke test:

```powershell
$env:MOBILEPROXY_API_KEY = "..."
npm run build; npm run smoke
```

## Manual fallback

If GitHub Actions is unavailable:

```bash
npm run build
npm publish --access public          # needs `npm login` as a member of @mobileproxy
./mcp-publisher login github          # interactive device login
./mcp-publisher publish
```

## Directories to keep listed

| Directory | How | Status |
|---|---|---|
| Official MCP Registry | automatic on every tag | ✅ |
| Glama | auto-indexed from GitHub, claim via `glama.json` | claim once |
| PulseMCP | form at pulsemcp.com | submit once |
| mcp.so | submit form | submit once |
| Smithery | smithery.ai, sign in with GitHub | check whether stdio servers are accepted |

## Site follow-ups (mobileproxy.space)

- Flag accounts whose API calls carry `User-Agent: @mobileproxy/mcp-server/*` as MCP users.
- Count registrations with `utm_source=mcp` (README, docs and server error messages link with it).
- Replace the `SOON` badge (`@templates/design_v2/index.tpl:~3196`) with a link to the npm package or a `/mcp.html` page.
