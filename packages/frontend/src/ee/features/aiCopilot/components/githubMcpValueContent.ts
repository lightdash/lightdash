// Value-forward copy shared by every surface that offers the GitHub MCP
// one-click connect (chat empty state + agent settings). Keep these in one
// place so the surfaces never drift.
//
// Note: this is NOT about writeback/opening PRs — the org's GitHub integration
// already handles dbt-project writeback. The MCP connection lets the agent READ
// the codebases that produce your analytics events, giving it extra context for
// semantic-layer changes and the business logic behind your metrics.
export const GITHUB_MCP_VALUE_HEADLINE =
    'Give the agent the code behind your data';
export const GITHUB_MCP_VALUE_SUMMARY =
    'Connect GitHub so the agent can read the codebases that produce your analytics events — extra context for semantic-layer changes and the business logic behind your metrics.';
export const GITHUB_MCP_SUGGESTED_PROMPT =
    'Trace one of my metrics back to the code that produces it';
export const GITHUB_MCP_CONNECTED_HEADLINE = 'GitHub connected';
export const GITHUB_MCP_CONNECTED_SUMMARY =
    'Ask the agent about the code behind a metric or event.';
