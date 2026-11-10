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
- Optional `display`, every key optional:

```json
{
    "series": {
        "order_count_sum": {
            "color": "#4C6EF5",
            "format": "si",
            "label": "Orders",
            "type": "bar",
            "valueLabelColor": "#212529",
            "valueLabelPosition": "top",
            "whichYAxis": 0
        }
    },
    "seriesOrder": ["order_count_sum"],
    "stack": "stack",
    "xAxis": { "dateFormat": "MMM YYYY", "label": "Month", "type": "time" },
    "yAxis": [{ "format": "si", "label": "Orders", "position": "left" }]
}
```

| Key                                   | Use when the user asks to                    | Values                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xAxis.label` / `yAxis[i].label`      | rename an axis                               | String. `yAxis[0]` is the left axis, `yAxis[1]` the right.                                                                                                                     |
| `xAxis.dateFormat`                    | show dates as days, weeks, months, years     | Day.js pattern for a `time` x axis: `"MMM D, YYYY"` (default), `"ddd, MMM D"`, `"MMM YYYY"`, `"[Q]Q YYYY"`, `"YYYY"`.                                                          |
| `yAxis[i].format` / `series.*.format` | show values as percentages or compact (1.5K) | `"percent"` (0.25 shows as 25%) or `"si"`. Other `format` values render unformatted. The axis format sets tick labels and is the fallback for its series' tooltips and labels. |
| `series.*.label`                      | rename a series in the legend and tooltip    | String. On a single-series chart `yAxis[0].label` wins; change that instead.                                                                                                   |
| `series.*.color`                      | recolor a series                             | Hex color.                                                                                                                                                                     |
| `series.*.type`                       | mix bars and lines                           | `"bar"` or `"line"`.                                                                                                                                                           |
| `series.*.valueLabelPosition`         | show values on the bars or points            | `"top"`, `"bottom"`, `"left"`, `"right"`, `"inside"`; `"hidden"` removes them.                                                                                                 |
| `series.*.valueLabelColor`            | recolor those value labels                   | Hex color; applies while `valueLabelPosition` shows labels.                                                                                                                    |
| `series.*.whichYAxis`                 | put a series on a second (right) axis        | `1` for right, `0` for left (default). Label and format the right axis in `yAxis[1]`.                                                                                          |
| `seriesOrder`                         | reorder series or stacked segments           | Series keys, drawn first to last; the first sits at the bottom of a stack.                                                                                                     |
| `stack`                               | stack bars                                   | `true`, `"stack"`, or `"stack100"`.                                                                                                                                            |

Key `series` and `seriesOrder` by series column: `<reference>_<aggregation>` (`order_count_sum`), or with `groupBy` one per group value, `<reference>_<aggregation>_<value>` (`order_count_sum_completed`). A `series` entry keyed by the bare y `reference` covers every series from that column that has no exact entry. `readContent` shows the keys an existing chart uses.

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

Optional `display` keys:

- `label` and `showLabel`: the caption under the value; `showLabel: false` hides it.
- `style`: compact notation, `"K"`, `"M"`, `"B"`, or `"T"`.
- `showComparison: true` compares the value with a second `fieldConfig.y` entry, when the user asks for change against a target or previous value. `comparisonFormat` is `"raw"` (difference) or `"percentage"`; `comparisonLabel` captions it; `flipColors: true` shows an increase red and a decrease green.
- `conditionalFormatting`: color the value by threshold, first matching rule wins: `[{ "operator": "lessThan", "value": 100, "color": "#E03131" }]`. Operators: `equals`, `notEquals`, `lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`. Optional `darkColor` for dark mode.

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

Each column needs `label`, `reference`, `visible`, and `frozen`.

## Explore-only settings

SQL chart config has no key for these; they exist only on charts built from an explore. When the user asks for one on a SQL chart, answer from this list: tell them SQL charts don't support it, and offer to rebuild the chart from an explore (`type: "chart"`, see `cartesian-chart-reference`) when an explore covers the same data.

- **Incomplete-period marking** (`showIncompletePeriod`): it needs the x dimension's time interval, and SQL columns carry none.
- **Reference lines** (`markLine`).
- **Color by category** (`colorByCategory`, `categoryColorOverrides`).
- **Display row trimming** (`rowLimit`). The SQL chart's `limit` only caps the rows it loads.
- **Horizontal bars** (`flipAxes`): bars are vertical only.
- **Area and scatter series**: `series.*.type` is `bar` or `line`.
- **Scrollable x axis** (data zoom).
- **Gaps in lines** (`connectNulls`): SQL line charts always join across missing values.
- **Axis ranges, tick intervals, and stack totals** (`min`/`max`, `minInterval`, `stackLabel`).
- **Conditional formatting**, except on `big_number` (`display.conditionalFormatting` above).
- **In-cell bars in tables** (`displayStyle: "bar"`): SQL tables render plain values.
- **Legend position**: SQL charts place the legend at the top whenever there is more than one series.

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
