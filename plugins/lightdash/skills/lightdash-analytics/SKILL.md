---
name: lightdash-analytics
description: Use when answering business questions, exploring governed metrics, querying Lightdash data, or creating Lightdash charts and dashboards through the Lightdash MCP server.
---

# Lightdash Analytics

Use the Lightdash MCP server as the source of truth for the user's governed semantic layer.

## Discover before querying

1. Set the active project if the server requires one.
2. Use `route_agent` when available; otherwise list the available explores.
3. Inspect the selected explore and fields before composing a metric query.
4. Use verified content as a reference when it matches the request.

Never invent explore names, field IDs, metric definitions, filter values, or query UUIDs. Search field values when a string filter must match an existing value.

## Answering questions

Prefer `run_metric_query` for questions that fit the semantic layer. Use `run_sql` only when the requested analysis cannot be represented through a governed explore.

If a metric query is still running, poll `get_query_result` with the returned query UUID. When a visual would clarify the result, render a completed metric query with `render_chart`.

State the metric, time period, filters, and any important caveats in the answer. Treat an empty result as a valid result rather than a failed query.

## Creating content and changing analytics

Before creating a chart or dashboard, inspect the relevant schema and existing content. Validate the query first, then use the server's creation workflow.

For dbt or content-as-code changes, work in a branch and use the Lightdash CLI workflow: preview the change, validate it, review it, then merge. Do not deploy or start AI writeback unless the user explicitly asks for that external change.

## Built-in Lightdash skills

The MCP server can expose additional Lightdash skills and references. Use `list_skills` when the client does not surface MCP resources directly, then read only the skill or reference relevant to the task.
