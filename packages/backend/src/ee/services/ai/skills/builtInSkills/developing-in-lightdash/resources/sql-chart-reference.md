---
name: sql-chart-reference
description: SQL chart body, chart kinds and config, the SQL approval step, and how to build dashboards from SQL charts in Lightdash.
---

# SQL Chart Reference

A SQL chart is a chart saved from raw warehouse SQL rather than from an explore. Use one only when the semantic layer cannot express the question; prefer a chart built from an explore whenever it can.

## Requirements

- SQL mode must be enabled for the agent, and the user needs the SQL chart save permission (manage custom SQL). If `createContent` reports that either is missing, stop and tell the user; do not retry.
- The SQL must be a single read-only `SELECT` or `WITH` query. It runs on the project's primary warehouse connection.
- Run the SQL first with `runContentQuery` (`source.type: "sql"`) to check the column names you reference in `config`, then save that exact SQL.
- To check a saved SQL chart's rows, run `runContentQuery` with `source.type: "chart"` (or `"dashboardChart"` for its dashboard tile) and `chartType: "sql_chart"`. Saved SQL runs without a new approval.

## Approval

Saving a SQL chart publishes SQL, so the user approves it first. When you call `createContent` with `type: "sql_chart"`, the user sees an approval card with the SQL, chart name, space, and chart kind:

- Approved: the chart is saved and the tool returns its `href` and persisted `slug`.
- Rejected: nothing is saved. Do not resubmit the same SQL; ask the user what they want instead.
- Timed out: nothing is saved. Tell the user and wait for them to ask again.

If the user chose "approve and don't ask again" in this thread, the chart saves without a new prompt.

## Body

Call `createContent` with `type: "sql_chart"` and this content:

```json
{
    "chartKind": "vertical_bar",
    "config": {
        "display": {
            "xAxis": { "label": "Status" },
            "yAxis": [{ "label": "Orders" }]
        },
        "fieldConfig": {
            "groupBy": [],
            "x": { "reference": "status", "type": "category" },
            "y": [{ "aggregation": "sum", "reference": "order_count" }]
        },
        "metadata": { "version": 1 },
        "type": "vertical_bar"
    },
    "contentType": "sql_chart",
    "description": "Orders per status",
    "limit": 500,
    "name": "Orders by status",
    "slug": "orders-by-status",
    "spaceSlug": "sales",
    "sql": "SELECT status, COUNT(*) AS order_count FROM orders GROUP BY 1",
    "version": 1
}
```

| Field         | Notes                                                                                   |
| ------------- | --------------------------------------------------------------------------------------- |
| `name`        | Display name.                                                                           |
| `description` | String or `null`.                                                                       |
| `slug`        | Requested slug; a suffix is added when it is taken. Use the returned slug from then on. |
| `spaceSlug`   | Space path, e.g. `"sales"` or `"sales/forecasts"`.                                      |
| `sql`         | Read-only `SELECT`/`WITH` query.                                                        |
| `limit`       | Maximum rows the chart loads.                                                           |
| `chartKind`   | Must equal `config.type`.                                                               |
| `config`      | Visualization config for the chart kind (below).                                        |
| `version`     | Always `1`.                                                                             |

Do not send `connection`, `access`, `updatedAt`, or `downloadedAt`.

`reference` values are column names returned by the SQL, exactly as the warehouse returns them.

## Chart kinds

| `chartKind`    | Use for                    | `config` shape                                 |
| -------------- | -------------------------- | ---------------------------------------------- |
| `vertical_bar` | Category comparisons       | `fieldConfig` (`x`, `y`, `groupBy`), `display` |
| `line`         | Trends over time           | `fieldConfig` (`x`, `y`, `groupBy`), `display` |
| `pie`          | Parts of a whole           | `fieldConfig` (`x` slices, one `y`), `display` |
| `big_number`   | One KPI                    | `fieldConfig` (`y` only), `display`            |
| `table`        | Row-level or detailed data | `columns` keyed by column name, `display`      |

Every `config` has `metadata: { "version": 1 }` and `type` equal to `chartKind`.

### Bar and line

- `fieldConfig.x`: `{ "reference": "<column>", "type": "category" | "time" }`. Use `time` for date or timestamp columns.
- `fieldConfig.y`: one entry per series, `{ "reference": "<column>", "aggregation": "sum" | "count" | "avg" | "min" | "max" | "any" }`. Use `any` when the SQL already aggregated the value.
- `fieldConfig.groupBy`: `[{ "reference": "<column>" }]` to split into series, or `[]`.
- Optional `fieldConfig.sortBy`: `[{ "reference": "<column>", "direction": "ASC" | "DESC" }]`.
- Optional `display`: `xAxis` (`label`, `type`), `yAxis` (`[{ "label", "position" }]`), `series` keyed by series reference (`label`, `color`, `type: "bar" | "line"`), `stack` (`true`, `"stack"`, or `"stack100"`), `legend` (`{ "position", "align" }`).

### Pie

```json
{
    "display": { "isDonut": false },
    "fieldConfig": {
        "groupBy": [],
        "x": { "reference": "status", "type": "category" },
        "y": [{ "aggregation": "sum", "reference": "order_count" }]
    },
    "metadata": { "version": 1 },
    "type": "pie"
}
```

### Big number

```json
{
    "display": { "label": "Total revenue", "style": "M" },
    "fieldConfig": {
        "y": [{ "aggregation": "sum", "reference": "revenue" }]
    },
    "metadata": { "version": 1 },
    "type": "big_number"
}
```

### Table

```json
{
    "columns": {
        "order_count": {
            "frozen": false,
            "label": "Orders",
            "reference": "order_count",
            "visible": true
        },
        "status": {
            "frozen": true,
            "label": "Status",
            "reference": "status",
            "visible": true
        }
    },
    "display": {},
    "metadata": { "version": 1 },
    "type": "table"
}
```

## Reading

`readContent` with `type: "sql_chart"` and the slug returns the same body. A SQL chart found with `findContent` has `chartSource: "sql"`.

## Editing

1. Call `readContent` with `type: "sql_chart"` and the slug.
2. Build the smallest JSON Patch, e.g. `[{ "op": "replace", "path": "/name", "value": "Orders per status" }]`.
3. Call `editContent` with `type: "sql_chart"`, the slug, and the patch.

- A patch that leaves `sql` untouched (name, description, limit, config, chart kind, space) saves straight away.
- A patch that changes `sql` goes through the same approval as creating a SQL chart: the edit saves only once the user approves the new SQL. If they reject it or it times out, nothing changes.
- Change `sql` only with `replace` (or `add`) and the full SQL string as `value`; `copy`, `move` or `remove` onto `/sql` is rejected.
- `slug`, `connection`, `updatedAt`, and `downloadedAt` cannot be patched.
- When you change `chartKind`, replace `config` too so that `config.type` matches, and keep `config` references in step with the columns the SQL returns.
- If you rename a SQL chart, also update the `title` and `chartName` of dashboard tiles that reference its slug.

## Dashboards with SQL charts

A dashboard tile can only reference a SQL chart that already exists:

1. Create each SQL chart with `createContent` (`type: "sql_chart"`) and wait for it to be approved and saved.
2. Note the persisted `slug` each call returns.
3. Create or edit the dashboard with one `sql_chart` tile per chart, using those slugs:

```json
{
    "h": 6,
    "properties": {
        "chartName": "Orders by status",
        "chartSlug": "orders-by-status",
        "title": "Orders by status"
    },
    "type": "sql_chart",
    "w": 12,
    "x": 0,
    "y": 0
}
```

Use `type: "sql_chart"` for SQL charts and `type: "saved_chart"` for charts built from an explore. If a rejected or timed-out SQL chart was meant for the dashboard, leave its tile out and tell the user.
