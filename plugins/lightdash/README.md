# Lightdash agent plugin

This plugin connects AI coding agents to the Lightdash MCP server and adds an
analytics workflow skill. It is intended for governed metric discovery,
semantic-layer queries, and creating analytics content safely.

One bundle serves two marketplaces:

- **Codex** (OpenAI plugins directory): `.codex-plugin/plugin.json` + `.mcp.json`
- **Cursor** (Cursor marketplace): `.cursor-plugin/plugin.json` + `mcp.json`,
  discovered via `.cursor-plugin/marketplace.json` at the repository root

Shared between both: `skills/lightdash-analytics` (guides the agent through
discovery, querying, and explicit confirmation before workflows that change
analytics content) and `assets/` (brand images).

## Authentication and instance URL

The MCP endpoint uses OAuth. Install the plugin and complete the Lightdash
sign-in prompt in your agent.

**Cursor**: `mcp.json` reads the endpoint from the `LIGHTDASH_MCP_URL`
environment variable, so one config serves every Lightdash instance — Cloud
workspaces and self-hosted alike. Before first use, set it to your instance:

```bash
export LIGHTDASH_MCP_URL="https://<your-workspace>.lightdash.cloud/api/v1/mcp"
# self-hosted: https://<your-lightdash-host>/api/v1/mcp
```

**Codex**: `.mcp.json` targets Lightdash Cloud (`app.lightdash.cloud`). For a
different workspace or a self-hosted instance, replace the URL with
`https://<your-lightdash-host>/api/v1/mcp` — the Codex manifest format has no
URL templating today.

## Submission checklist

1. Test sign-in and a read-only metric query against a real Lightdash project.
2. Confirm the required marketplace category and authentication policy.
3. Add directory-listing screenshots to `./assets/` and reference them from
   `interface.screenshots` in the Codex `plugin.json`.
4. Bump the plugin version in every manifest for each published release —
   marketplaces re-review updates.
