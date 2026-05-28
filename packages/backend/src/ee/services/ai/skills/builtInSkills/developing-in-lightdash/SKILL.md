---
name: developing-in-lightdash
description: Use when reading and editing Lightdash dashboards and charts as JSON, including dashboard layout and chart-type-specific configuration.
---

# Developing in Lightdash

Use this skill when working with Lightdash dashboards and charts.

Use content tools:

For reads, call `readContent` with:

- `type: "dashboard"` or `type: "chart"`
- `slug: "your-content-slug"`

This should return the current dashboard or chart JSON for the requested content.

For edits, call `editContent` with:

- `type: "dashboard"` or `type: "chart"`
- `slug: "your-content-slug"`
- `patch: [...]`

`patch` should describe the requested RFC6902 JSON edit.

### Recommended workflow for editing Dashboards:

1. Call `readContent` and inspect the current JSON shape.
2. Always read the `dashboard-reference` resource
3. Build the smallest possible JSON Patch.
4. Call `editContent` with that patch.
5. Re-read if needed to verify the final state.

### Recommended workflow for editing Charts/Dashboard Tiles:

1. Call `readContent` for the chart slug.
2. Always read the chart reference for chart type (see `Choosing the Right Chart Type` below)
3. If you add or change filters, verify exact filter values before patching.
4. If you change the chart's name or purpose, also update dashboards that reference that chart.
5. Build the smallest possible JSON Patch.
6. Call `editContent` with that patch.
7. Re-read if needed to verify the final state.

### Recommended workflow for creating new Charts:

1. Use `discoverFields` to explore available fields and plan your chart
2. Always read the chart reference for chart type (see `Choosing the Right Chart Type` below) to understand required fields and configuration.
3. Build the full chart JSON with that metric query and other required fields and call `createContent` with that JSON to create the chart.

### Recommended workflow for creating new Dashboards:

1. Always read the `dashboard-reference` and `dashboard-best-practices` resources
2. Explore existing dashboards and charts to find reusable content and inspiration for layout and design.
3. Use `discoverFields` to explore available fields and plan which charts to include.
4. Create an empty dashboard shell first
5. Start building charts and adding them to the dashboard one by one, use the workflow outlined above for creating charts

Rules:

- Always read content before editing.
- Preserve unrelated fields.
- Prefer minimal patches.
- Follow the dashboard or chart shape from the resource instead of inventing structure.
- When you create or edit content, please provide links for them in the final response

## Common Mistakes

| Mistake                                                 | Consequence                                                                                      | Prevention                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Guessing filter values**                              | Case mismatches like `"Payment"` vs `"payment"` can make a chart silently return no data         | Verify exact values before editing filters. Do not guess string filter values                       |
| **Not updating dashboard tiles after renaming a chart** | Dashboard tile still shows the old title because tile `title` and `chartName` do not auto-update | If you change a chart's name or purpose, also update dashboard tiles that reference its `chartSlug` |
| **Including unused dimensions in `metricQuery`**        | Extra dimensions change grouping and can produce wrong numbers                                   | Every dimension in `metricQuery.dimensions` must be used by the chart configuration                 |
| **Missing `contentType`**                               | Content type becomes ambiguous                                                                   | Always keep `contentType: "chart"` or `contentType: "dashboard"`                                    |

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
    - `dashboard-best-practices` for tips on effective dashboard design
- `cartesian-chart-reference` for bar, line, area, or scatter charts
- the specific chart resource for any other chart type
