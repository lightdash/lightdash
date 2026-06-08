---
name: developing-in-lightdash
description: Use when reading, creating, and editing Lightdash dashboards and charts as JSON, including dashboard layout and chart-type-specific configuration.
metadata:
    title: Developing in Lightdash
---

# Developing in Lightdash

Use this skill when working with Lightdash dashboards and charts.

## What You Can Do

| Task                          | Tools/Action                                                | References                            |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Read dashboards and charts    | `readContent`                                               | `dashboard-reference`, chart refs     |
| Edit dashboards               | `editContent` with RFC6902 JSON Patch                       | `dashboard-reference`                 |
| Edit charts and tiles         | `editContent`, then update referencing dashboards if needed | Chart refs, `dashboard-reference`     |
| Create charts                 | `discoverFields`, `runContentQuery`, `createContent`        | Chart refs                            |
| Create dashboards             | `discoverFields`, `createContent`                           | `dashboard-reference`, best practices |
| Add period comparisons        | Edit chart `metricQuery` and config                         | `period-over-period-reference`        |
| Verify changed metric queries | `runContentQuery` with `source.type: "metricQuery"`         | Chart refs                            |

Rules:

- Always read content before editing if you have not read it since the last user message.
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
| **Leaving invalid touched tile positions**              | Edited tiles overlap, sit outside the 36-column grid, or leave unintended gaps                   | Validate touched tiles against `dashboard-reference` grid layout rules after tile actions           |
| **Missing `contentType`**                               | Content type becomes ambiguous                                                                   | Always keep `contentType: "chart"` or `contentType: "dashboard"`                                    |

## Core Workflows

### Edit Dashboards

1. Call `readContent` and inspect the current JSON shape.
2. Always read the `dashboard-reference` resource.
3. Build the smallest possible JSON Patch.
4. Call `editContent` with that patch.
5. Re-read if needed to verify the final state.

### Edit Charts and Dashboard Tiles

1. Call `readContent` for the chart slug.
2. Always read the chart reference for chart type (see `Choosing the Right Chart Type` below).
3. If you add or change filters, verify exact filter values before patching.
4. If you change the chart's name or purpose, also update dashboards that reference that chart.
5. Build the smallest possible JSON Patch.
6. If you changed the chart's `metricQuery`, call `runContentQuery` with `source.type: "metricQuery"` and the edited chart's `tableName`/`metricQuery`.
7. Call `editContent` with that patch.
8. Re-read if needed to verify the final state.

### Create Charts

1. Use `discoverFields` to explore available fields and plan your chart.
2. Always read the chart reference for chart type (see `Choosing the Right Chart Type` below) to understand required fields and configuration.
3. Build the full chart JSON with that metric query and other required fields.
4. Call `runContentQuery` with `source.type: "metricQuery"` and the chart's `tableName`/`metricQuery`.
5. Call `createContent` with the verified chart JSON.

### Create Dashboards

1. Always read the `dashboard-reference` and `dashboard-best-practices` resources.
2. Explore existing dashboards and charts to find reusable content and inspiration for layout and design.
3. Use `discoverFields` to explore available fields and plan which charts to include.
4. Create an empty dashboard shell first.
5. Start building charts and adding them to the dashboard one by one, using the workflow above for creating charts.

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

### Dashboards

- `dashboard-reference` - Dashboard structure, layout, tabs, tiles, and filters
- `dashboard-best-practices` - Dashboard design guidance
