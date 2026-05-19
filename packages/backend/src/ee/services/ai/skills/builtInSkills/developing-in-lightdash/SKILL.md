---
name: developing-in-lightdash
description: Use when reading and editing Lightdash dashboards and charts as JSON, including dashboard layout and chart-type-specific configuration.
---

# Developing in Lightdash

Use this skill when reading and editing Lightdash dashboards and charts.

Use content tools:

For reads, call `readContent` with:

- `type: "dashboard"` or `type: "chart"`
- `slug: "your-content-slug"`

This should return the current dashboard or chart JSON for the requested content.

For edits, call `editContent` with:

- `type: "dashboard"` or `type: "chart"`
- `slug: "your-content-slug"`
- `patch: [...]`

`patch` should describe the requested JSON edit. The intended flow is to patch current JSON, validate it, persist it, then refresh affected frontend state via invalidation.

Recommended loop:

1. Load the skill, then load the relevant resource.
2. Call `readContent` and inspect the current JSON shape.
3. If needed, read related content too before editing.
4. Build the smallest possible JSON Patch.
5. Call `editContent` with that patch.
6. Treat validation as part of the edit flow before accepting the change.
7. Re-read if needed to verify the final state.

Rules:

- Always read before editing.
- Preserve unrelated fields.
- Prefer minimal patches.
- Use slugs, not UUIDs, at the tool boundary.
- Follow the dashboard or chart shape from the resource instead of inventing structure.

## Common Mistakes

| Mistake                                                 | Consequence                                                                                      | Prevention                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Guessing filter values**                              | Case mismatches like `"Payment"` vs `"payment"` can make a chart silently return no data         | Verify exact values before editing filters. Do not guess string filter values                       |
| **Not updating dashboard tiles after renaming a chart** | Dashboard tile still shows the old title because tile `title` and `chartName` do not auto-update | If you change a chart's name or purpose, also update dashboard tiles that reference its `chartSlug` |
| **Including unused dimensions in `metricQuery`**        | Extra dimensions change grouping and can produce wrong numbers                                   | Every dimension in `metricQuery.dimensions` must be used by the chart configuration                 |
| **Missing `contentType`**                               | Content type becomes ambiguous                                                                   | Always keep `contentType: "chart"` or `contentType: "dashboard"`                                    |

## Editing Charts

1. Load the relevant chart resource for the chart type you are editing.
2. Call `readContent` for the chart slug.
3. If you add or change filters, verify exact filter values before patching.
4. If you change the chart's name or purpose, also update dashboards that reference that chart.
5. Build the smallest possible JSON Patch.
6. Call `editContent` with that patch.
7. Re-read if needed to verify the final state.

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

Use `spaceSlug` for shared charts. Add `dashboardSlug` to scope a chart to a specific dashboard.

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

Start with:

- `dashboard-reference` for dashboards
- `cartesian-chart-reference` for bar, line, area, or scatter charts
- the specific chart resource for any other chart type
