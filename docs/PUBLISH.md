# Publishing runbook

One-time setup, then `git push --tags` does the rest via GitHub Actions.

## One-time setup (do once per repo)

### 1. npm organization

```bash
npm login                              # log in as the org owner
npm org create mobileproxy             # creates @mobileproxy scope (or use existing)
```

If `@mobileproxy` already exists and you're a member with publish rights,
skip the `create` step.

### 2. Create an npm automation token

[npmjs.com/settings/<user>/tokens/new](https://www.npmjs.com/settings/) →
**Automation** type → scope **`@mobileproxy/*`** (or just this package) →
write access. Copy the token.

### 3. GitHub repo

```bash
# Inside this folder
git remote add origin git@github.com:mobileproxy/mcp-server.git
git push -u origin main
```

If the `mobileproxy` GitHub organization doesn't exist, create it first
([github.com/organizations/new](https://github.com/organizations/new)).

### 4. Add the npm token as a GitHub secret

GitHub repo → Settings → Secrets and variables → Actions → New repository
secret:
- Name: `NPM_TOKEN`
- Value: the automation token from step 2

(Optional) Also add `MOBILEPROXY_API_KEY` if you want CI to run smoke tests
against the live API on PRs.

## Each release

```bash
# 1. bump the version (creates a git tag automatically)
npm version patch        # 0.1.0 -> 0.1.1
# or `npm version minor` / `npm version major`

# 2. push the commit and tag
git push --follow-tags

# 3. GitHub Actions runs publish.yml → npm publish --access public --provenance
#    Watch progress at https://github.com/mobileproxy/mcp-server/actions
```

After ~1 minute the new version shows up on npm:
[npmjs.com/package/@mobileproxy/mcp-server](https://www.npmjs.com/package/@mobileproxy/mcp-server)

## Manual publish (fallback)

If GitHub Actions is unavailable:

```bash
npm run build
npm publish --access public
```

This requires you to have run `npm login` and be a member of `@mobileproxy`.

## After first publish

- Submit to MCP Registry: [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)
- Replace the `SOON` badge on mobileproxy.space (`@templates/design_v2/index.tpl:~3196`)
  with a link to `/mcp.html` or the npm package
- Create the `/mcp.html` landing page on mobileproxy.space
