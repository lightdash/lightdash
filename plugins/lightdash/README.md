# Lightdash Codex plugin

This plugin connects Codex to the Lightdash MCP server and adds an analytics
workflow skill. It is intended for governed metric discovery, semantic-layer
queries, and creating analytics content safely.

## Included components

- `.mcp.json` configures the Lightdash Cloud MCP endpoint.
- `skills/lightdash-analytics` guides Codex through discovery, querying, and
  explicit confirmation before workflows that change analytics content.

The MCP endpoint uses OAuth. Install the plugin and complete the Lightdash sign-in
prompt in Codex. The bundled URL targets Lightdash Cloud (`app.lightdash.cloud`).
For a self-hosted instance, replace the URL in `.mcp.json` with
`https://<your-lightdash-host>/api/v1/mcp` before packaging the plugin — the
plugin manifest format has no URL templating, so a per-host placeholder is not
possible today; raise template MCP URLs with OpenAI during submission.

## Submission checklist

1. Test sign-in and a read-only metric query against a real Lightdash project.
2. Confirm the required marketplace category and authentication policy.
3. Add directory-listing screenshots to `./assets/` and reference them from
   `interface.screenshots` in `plugin.json`.
4. Replace the repository-local marketplace metadata with the destination
   marketplace's entry when publishing.
5. Bump the plugin version for every published release.
