---
name: developing-in-lightdash
description: Use when reading, creating, and editing Lightdash dashboards and charts as JSON, including dashboard layout and chart-type-specific configuration.
---

# Developing in Lightdash

For in-process agents and MCP clients working with JSON content tools; Autopilot reuses the chart references with its own workflow.

Use this skill when working with Lightdash dashboards and charts.

## MCP tool names

This skill is shared with Lightdash's native agent, so its workflows use camelCase tool names. When reading it through MCP:

- Use `read_content`, `edit_content`, and `create_content` for `readContent`, `editContent`, and `createContent`.
- Where a workflow calls `editContent` with text edits, call `edit_content` with an RFC6902 JSON Patch against the JSON `read_content` returned.
- Use `grep_fields` and `get_metadata` for native `grepFields` and `getMetadata`.
- Use `generate_hashes` for native `generateHashes`.
- Replace `runContentQuery` with `run_metric_query` to check a chart's governed semantic-layer `metricQuery`. Do not use `run_sql` for this check.
- Use `run_sql` where a workflow runs `runContentQuery` with `source.type: "sql"` or `chartType: "sql_chart"`; for a saved SQL chart, pass the `sql` from `read_content`.
- Use `query` where a workflow runs `runContentQuery` with `chartType: "composer_chart"`; pass the pipeline from `read_content`.

## What You Can Do

| Task                               | Tools/Action                                                      | References                            |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| Read dashboards and charts         | `readContent`                                                     | `dashboard-reference`, chart refs     |
| Create, read, edit SQL charts      | `createContent` / `readContent` / `editContent`, `sql_chart`      | `sql-chart-reference`                 |
| Create, read, edit composer charts | `createContent` / `readContent` / `editContent`, `composer_chart` | `composer-chart-reference`            |
| Read data apps (read-only)         | `readContent` with `type: data_app`                               | manifest-shaped JSON, no source code  |
| Edit dashboards                    | `editContent` with text edits                                     | `dashboard-reference`                 |
| Edit charts and tiles              | `editContent`, then update referencing dashboards if needed       | Chart refs, `dashboard-reference`     |
| Create charts                      | `grepFields`, `getMetadata`, `createContent`                      | Chart refs                            |
| Create dashboards                  | `grepFields`, `getMetadata`, `createContent`                      | `dashboard-reference`, best practices |
| Add period comparisons             | Edit chart `metricQuery` and config                               | `period-over-period-reference`        |
| Check changed metric queries       | `runContentQuery` with `source.type: "metricQuery"`               | Chart refs                            |

Rules:

- Read content before editing unless its current text is already in the conversation.
- Preserve unrelated fields.
- Prefer minimal edits.
- Follow the dashboard or chart shape from the resource instead of inventing structure.
- When you create or edit content, please provide links for them in the final response

## Common Mistakes

| Mistake                                                 | Consequence                                                                                      | Prevention                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Guessing filter values**                              | Case mismatches like `"Payment"` vs `"payment"` can make a chart silently return no data         | Verify exact values before editing filters. Do not guess string filter values                       |
| **Not updating dashboard tiles after renaming a chart** | Dashboard tile still shows the old title because tile `title` and `chartName` do not auto-update | If you change a chart's name or purpose, also update dashboard tiles that reference its `chartSlug` |
| **Including unused dimensions in `metricQuery`**        | Extra dimensions change grouping and can produce wrong numbers                                   | Every dimension in `metricQuery.dimensions` must be used by the chart configuration                 |
| **Leaving invalid touched tile positions**              | Edited tiles overlap, sit outside the 36-column grid, or leave unintended gaps                   | Validate touched tiles against `dashboard-reference` grid layout rules after tile actions           |
| **Missing `contentType`**                               | Content type becomes ambiguous                                                                   | Always keep `contentType: "chart"` or `contentType: "dashboard"`                                    |

## Core Workflows

### Edit Dashboards

1. Call `readContent` unless the dashboard's current text is already in the conversation.
2. For tabs, filters, non-chart tiles or layout rules you have not seen, read the `dashboard-reference` resource.
3. Call `editContent` with the smallest text edits, all changes to the dashboard in one call.

To add or retarget a dashboard filter, take each tile's explore and field ids from its read-only `chartQuery` in the dashboard JSON (see `Per-Tile Filter Targeting` in `dashboard-reference`). Do not read every chart on the dashboard for that. A dimension filter is added to `/filters/dimensions` with this shape; `target` and `tileTargets` values are objects with `fieldId` and `tableName`, never bare field id strings:

```json
{
    "slug": "orders-order-date-day",
    "label": "Order date",
    "operator": "inThePast",
    "settings": { "completed": false, "unitOfTime": "days" },
    "values": [90],
    "target": { "fieldId": "orders_order_date_day", "tableName": "orders" },
    "tileTargets": {
        "events-per-day": {
            "fieldId": "events_date_day",
            "tableName": "events"
        }
    }
}
```

When `config.controlOrder` is present, add a `{ "kind": "filter", "slug": ... }` entry with the new filter's `slug` where it should sit on the filter bar, and remove a deleted filter's entry. Control slugs only link entries within the edit and are never saved. See `Control order` in `dashboard-reference`.

To put a filter in an existing section, set its `sectionSlug` to a `slug` from `config.controlSections`. Group controls into sections only when the user asks or the dashboard already uses them, and read `Control sections` in `dashboard-reference` before creating, renaming or removing one. An edit that changes something else leaves `controlSections`, every `sectionSlug`, `dateZoomConfig` and `controlOrder` as read.

### Edit Charts and Dashboard Tiles

1. Call `readContent` for the chart slug unless its current text is already in the conversation.
2. For options beyond the shape you have, read the chart reference for the chart type (see `Choosing the Right Chart Type` below).
3. If you add or change filters, verify exact filter values before editing.
4. If you change the chart's name or purpose, also update dashboards that reference that chart.
5. Call `editContent` with the smallest text edits, all changes to the chart in one call. The write checks every field id against the explore and names the closest ids for unknown ones.

### Create Charts

1. Use `grepFields`, then `getMetadata` if needed, to find the fields.
2. For options beyond the shape you have, read the chart reference for the chart type (see `Choosing the Right Chart Type` below).
3. Call `createContent` with the full chart JSON. The write checks every field id against the explore and names the closest ids for unknown ones, so no test query is needed.

When explore fields cannot produce the chart, read `sql-chart-reference` before going further: it says what to offer the user.

For a weekly chart of "the last 12 weeks up to today" where every week starts on its first day, put the `inThePast` filter on the week dimension (e.g. `orders_order_date_week`, `completed: false`, `unitOfTime: weeks`, `values: [12]`), not on the day or raw date. That gives 12 weekly rows: 11 full weeks plus the current week to date. The same filter on a day field starts mid-week, so the first week is partial.

### Create Dashboards

1. Use `grepFields`, then `getMetadata` if needed, to find the fields for each chart. When the user leaves the charts open, `dashboard-best-practices` has design guidance.
2. In one response, create the dashboard without chart tiles, then each chart with `dashboardSlug` set to it. Calls run in order; each chart is placed as a tile in rows that fill the grid, so edit the dashboard only to change that layout or add non-chart tiles, tabs or filters (`dashboard-reference`).

### Create and Edit SQL Charts

Always read `sql-chart-reference` first: it says when to create a SQL chart, and how to save, edit and place one on a dashboard.

### Create and Edit Composer Charts

Always read `composer-chart-reference` first: it says when to create a composer chart, and how to save, test and edit one.

## Editing Charts

Dashboard tiles have their own titles. A `saved_chart` tile's `title` and `chartName` are independent overrides and do not automatically change when a chart is renamed. If you change a chart from `"Total Revenue"` to `"Gross Profit"`, update the dashboard tile too.

```json
{
    "tiles": [
        {
            "properties": {
                "chartName": "Gross Profit",
                "chartSlug": "total-revenue-kpi",
                "title": "Gross Profit"
            },
            "type": "saved_chart"
        }
    ]
}
```

## Slug Fields

`slug` is a read-only stable identifier.

### Dashboards

- `spaceSlug` is the dashboard's space path. Changing it moves the dashboard to another space.
- Dashboard tile `properties.chartSlug` references an existing reusable or dashboard-owned chart.

### Charts

Charts are either reusable space charts or dashboard-owned charts.

- Reusable chart: no `dashboardSlug`; `spaceSlug` is its space path and changing it moves the chart.
- Dashboard-owned chart: has `dashboardSlug`; both `dashboardSlug` and `spaceSlug` are read-only, and `spaceSlug` is the owning dashboard's space.

## Chart Types

All charts share a common base structure:

```json
{
    "chartConfig": {
        "config": {},
        "type": "<type>"
    },
    "contentType": "chart",
    "dashboardSlug": "my-dashboard",
    "metricQuery": {
        "dimensions": ["my_explore_category"],
        "exploreName": "my_explore",
        "filters": {},
        "limit": 500,
        "metrics": ["my_explore_total_sales"],
        "sorts": []
    },
    "name": "Chart Name",
    "slug": "unique-chart-slug",
    "spaceSlug": "target-space",
    "tableConfig": {
        "columnOrder": []
    },
    "tableName": "my_explore",
    "version": 1
}
```

Spaces can be nested. Use `parent/child` syntax in `spaceSlug` for sub-spaces, for example `"sales/forecasts"`. A bare slug like `"sales-forecasts"` is a flat top-level space; the slash defines the hierarchy.

## Choosing the Right Chart Type

| Data Pattern                | Recommended Chart          | Why                                                |
| --------------------------- | -------------------------- | -------------------------------------------------- |
| Trends over time            | Line or area (`cartesian`) | Shows continuous change with time on the X-axis    |
| Category comparisons        | Bar (`cartesian`)          | Easy visual comparison between discrete categories |
| Part-of-whole relationships | `pie` or `treemap`         | Shows proportions or composition                   |
| Single KPI metric           | `big_number`               | Focuses attention on one important value           |
| Conversion stages           | `funnel`                   | Shows drop-off between sequential stages           |
| Progress toward target      | `gauge`                    | Shows current value relative to a goal             |
| Geographic data             | `map`                      | Places values on points or regions                 |
| Flow between categories     | `sankey`                   | Shows how values move from source to target        |
| Detailed records            | `table`                    | Shows row-level or pivoted data clearly            |
| Advanced custom needs       | `custom`                   | Full Vega-Lite control                             |

| Type         | Use Case                 | Resource                     |
| ------------ | ------------------------ | ---------------------------- |
| `cartesian`  | Bar, line, area, scatter | `cartesian-chart-reference`  |
| `pie`        | Parts of whole           | `pie-chart-reference`        |
| `table`      | Data tables              | `table-chart-reference`      |
| `big_number` | KPIs                     | `big-number-chart-reference` |
| `funnel`     | Conversion funnels       | `funnel-chart-reference`     |
| `gauge`      | Progress indicators      | `gauge-chart-reference`      |
| `treemap`    | Hierarchical composition | `treemap-chart-reference`    |
| `map`        | Geographic data          | `map-chart-reference`        |
| `sankey`     | Flow diagrams            | `sankey-chart-reference`     |
| `custom`     | Vega-Lite                | `custom-viz-reference`       |

For period comparisons, read `period-over-period-reference` in addition to the chart type reference.

## Resources

### Charts

- `cartesian-chart-reference` - Bar, line, area, scatter
- `pie-chart-reference` - Parts of whole
- `table-chart-reference` - Data tables
- `big-number-chart-reference` - KPIs
- `funnel-chart-reference` - Conversion funnels
- `gauge-chart-reference` - Progress indicators
- `treemap-chart-reference` - Hierarchical composition
- `map-chart-reference` - Geographic data
- `sankey-chart-reference` - Flow diagrams
- `custom-viz-reference` - Vega-Lite
- `period-over-period-reference` - PoP comparisons
- `sql-chart-reference` - Charts saved from raw warehouse SQL, their approval step, and dashboards built from them
- `composer-chart-reference` - Dashboard charts drawn from a pipeline of queries: creating, reading, testing and editing them
- `field-formatting-reference` - Chart-level field formatting overrides for metrics and dimensions

### Dashboards

- `dashboard-reference` - Dashboard structure, layout, tabs, tiles, and filters
- `dashboard-best-practices` - Dashboard design guidance
