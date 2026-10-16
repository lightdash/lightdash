# Lightdash agent plugin

This plugin connects AI coding agents to the Lightdash MCP server and adds an
analytics workflow skill. It is intended for governed metric discovery,
semantic-layer queries, and creating analytics content safely.

One bundle serves three marketplaces:

- **Claude** (Claude plugin directory and Claude Code): `.claude-plugin/plugin.json`
  - `.mcp.json`, discovered via `.claude-plugin/marketplace.json` at the
    repository root
- **Codex** (OpenAI plugins directory): `.codex-plugin/plugin.json` + `codex.mcp.json`
- **Cursor** (Cursor marketplace): `.cursor-plugin/plugin.json` + `mcp.json`,
  discovered via `.cursor-plugin/marketplace.json` at the repository root

Shared between both: `skills/lightdash-analytics` (guides the agent through
discovery, querying, and explicit confirmation before workflows that change
analytics content) and `assets/` (brand images).

## Install in Claude Code

```
/plugin install lightdash --marketplace lightdash/lightdash
```

Claude Code asks for your MCP server URL when the plugin is enabled. Paste
the full URL of your instance, Cloud or self-hosted:

```
https://<workspace>.lightdash.cloud/api/v1/mcp
https://<your-lightdash-host>/api/v1/mcp
```

Then run `/mcp` and complete the Lightdash sign-in. Non-interactive installs
pass the value directly:

```bash
claude plugin install lightdash@lightdash --config mcp_url=https://<workspace>.lightdash.cloud/api/v1/mcp
```

In claude.ai, Claude Desktop and Cowork the per-workspace URL comes from the
Lightdash MCP connector in the Claude directory, not from this plugin: the
connector listing uses a URL pattern, so each user enters their own instance
URL and signs in with OAuth (client ID metadata documents, with dynamic client
registration as the fallback).

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

**Codex**: `codex.mcp.json` targets Lightdash Cloud (`app.lightdash.cloud`). For a
different workspace or a self-hosted instance, replace the URL with
`https://<your-lightdash-host>/api/v1/mcp` — the Codex manifest format has no
URL templating today.
