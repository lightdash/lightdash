---
name: answering-data-questions
description: Use for data answers, ad hoc analysis, ad hoc charts, field discovery, query constraints, raw SQL fallback, table calculations, custom metrics, and forecast limitations.
---

# Answering Data Questions

Use this skill for counts, totals, breakdowns, trends, "what is", "show me", ad hoc charts, and other data analysis requests.

## Request Handling

- Treat questions as requests to retrieve data.
- For a "table", generate a table visualization. Never produce markdown tables.
- Use saved chart execution when a pinned chart is in context and the user wants to inspect its rows.
- For existing dashboards or charts, search saved content and return descriptive markdown links. Prefer verified content when it fits. If nothing matches, offer to build a new chart from available data.
- For dashboard or saved chart creation/editing, load `developing-lightdash-content` instead.
- For semantic-layer changes or impact checks before removing, renaming, or deduplicating fields, load `semantic-layer-writeback`.

## Discovery Workflow

1. Read relevant high/medium knowledge documents first when their summaries plausibly match the request.
2. Use field discovery for data questions.
3. If discovery is ambiguous, ask the suggested clarification and list candidates. Do not query.
4. If no explore matches, explain that and offer alternatives.
5. Do not rediscover on follow-ups that iterate on the same data.

Use semantic-layer inventory search for project-wide questions about metrics or dimensions, such as duplicate metrics or available fields across explores. Use field discovery when retrieving specific data.

Before asking for clarification, check whether a knowledge document already resolves the ambiguity.

## Query Rules

- Never invent field IDs. Use discovered fields, except custom metrics you create.
- Pick date granularity from the user's wording.
- Field hints override descriptions.
- Any sort field must also be selected.
- Trust joined-table fields surfaced by discovery rather than substituting similar base-table fields.
- Do not mix fields from different explores in one visualization. If raw SQL is available and the user needs cross-explore data not modelled in Lightdash, use it.
- Use exact string values. Search values instead of guessing casing or labels.
- Add explicit date filters for time windows. Do not approximate time windows with sort or limit.
- Use limits only for explicit "top N" or "show me N rows" requests.

## Time-Based Filters

If the user mentions any time window, add an explicit date dimension filter. Sorting, limiting, or describing the window in the response is not enough.

- Use relative filters for relative windows and between filters for explicit ranges.
- Resolve relative windows against today's date from the system prompt.
- Date fields from joined tables are valid filters. Prefer a joined-table date over no date filter.
- For multiple non-contiguous periods, prefer one equals rule on a date field at the requested granularity.
- Do not use an OR dimension filter when a categorical filter is also present. It can make the categorical filter optional.
- Use one between filter per range only when date ranges are the sole dimension filter and no granularity-aligned equals rule fits.

## String Filters

String dimension metadata may include case-sensitivity. When case-sensitive filters apply, match casing exactly; otherwise string filters ignore casing.

## Chart Generation

- Read chart parameter docs instead of guessing options.
- Set axis labels.
- Put extra grouping dimensions in chart grouping, not as a second x-axis.
- After generating a chart, offer to find related saved content when useful.
- Available ad hoc chart types are bar, horizontal bar, line, area, scatter, pie, funnel, and table.

## Table Calculations

Use table calculations for row-by-row math over query results, including:

- Aggregating already-aggregated metrics.
- Ranking, top N per group, and percentiles.
- Percent of total, running totals, moving averages, and period-over-period changes.

Default to a table when the user wants calculated values unless they ask for a chart.

## Custom Metrics

Create a custom metric when the explore lacks a metric matching the request. Pick a compatible base dimension in the same explore and use the generated custom metric field ID in the query, chart, sorts, filters, or table calculations.

Reference a custom metric by `<table>_<name>`:

- `{name: "avg_customer_age", table: "customers"}` -> `customers_avg_customer_age`
- `{name: "total_revenue", table: "payments"}` -> `payments_total_revenue`

If a reusable metric seems missing, mention that you answered with an ad hoc metric and offer to add a semantic-layer metric via pull request.

## Raw SQL

Prefer governed Lightdash queries when they fit. Use raw SQL only when the semantic layer cannot answer, the user explicitly asks for SQL, or warehouse-specific logic is required.

Rules:

- SELECT/WITH only.
- Do not use `information_schema`; use discovery tools.
- Do not run `SELECT *` sampling.
- Compose multi-stage logic into one final query where possible.
- If SQL fails on missing columns or relations, inspect table metadata before retrying.
- Qualify tables with the project schema when known.
- If multiple SQL calls are needed, make the final SQL call the composed query that produces the answer.
- Keep approval cost in mind: every SQL call costs the user an approval click.
- Do not paste full SQL in the final response unless the user asks.
- If the latest successful SQL should be opened in SQL Runner, include `[Open in SQL Runner](#sql-runner-link)`.

## Limitations

- Do not invent data. Only describe query results.
- Do not create custom dimensions or modify explore SQL.
- Do not forecast, predict, project, or estimate future values, even with a disclaimer. Offer historical analysis only and avoid future-dated rows. Do not use words like "forecast", "projection", "predicted", or "estimate for next" in the response after declining.
