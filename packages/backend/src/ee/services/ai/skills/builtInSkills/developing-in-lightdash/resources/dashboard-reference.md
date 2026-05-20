---
name: dashboard-reference
title: Dashboard Reference
description: Full dashboard structure, tile types, grid layout, filters, config, examples, and best practices for editing dashboards in Lightdash.
---

# Dashboard Reference

Dashboards combine multiple charts, KPIs, and content tiles into a cohesive view for analysis and monitoring.

## Dashboard Structure

```json
{
    "contentType": "dashboard",
    "config": {
        "isAddFilterDisabled": false,
        "isDateZoomDisabled": false
    },
    "description": "Overview of sales performance",
    "filters": {
        "dimensions": []
    },
    "name": "Sales Dashboard",
    "slug": "sales-dashboard",
    "spaceSlug": "sales",
    "tabs": [],
    "tiles": [],
    "version": 1
}
```

## Tile Types

### Saved Chart Tile

Display a chart from your project:

```json
{
    "tiles": [
        {
            "h": 6,
            "properties": {
                "chartSlug": "monthly-revenue",
                "hideTitle": false,
                "title": "Monthly Revenue"
            },
            "type": "saved_chart",
            "w": 12,
            "x": 0,
            "y": 0
        }
    ]
}
```

**WARNING:** The `title` property is independent of the chart's own name. When you rename or repurpose a chart, you MUST also update the `title` in every dashboard tile that references it via `chartSlug`. Forgetting this leaves stale titles on the dashboard.

### SQL Chart Tile

Display a SQL-based chart:

```json
{
    "tiles": [
        {
            "h": 6,
            "properties": {
                "chartSlug": "custom-sql-chart",
                "savedSqlUuid": "abc123-def456"
            },
            "type": "sql_chart",
            "w": 12,
            "x": 12,
            "y": 0
        }
    ]
}
```

### Markdown Tile

Add text, notes, or instructions:

```json
{
    "tiles": [
        {
            "h": 4,
            "properties": {
                "content": "## Q4 Performance Summary\n\n- Revenue up **15%** vs last quarter\n- New customer acquisition improved\n- Focus areas:\n  1. Enterprise segment\n  2. APAC expansion\n\n[View detailed report](/dashboards/q4-deep-dive)",
                "title": "Key Insights"
            },
            "type": "markdown",
            "w": 12,
            "x": 0,
            "y": 6
        }
    ]
}
```

### Loom Video Tile

Embed Loom videos:

```json
{
    "tiles": [
        {
            "h": 6,
            "properties": {
                "title": "Dashboard Walkthrough",
                "url": "https://www.loom.com/share/abc123"
            },
            "type": "loom",
            "w": 12,
            "x": 24,
            "y": 0
        }
    ]
}
```

### Heading Tile

Add section headers:

```json
{
    "tiles": [
        {
            "h": 1,
            "properties": {
                "text": "Regional Breakdown"
            },
            "type": "heading",
            "w": 36,
            "x": 0,
            "y": 10
        }
    ]
}
```

## Grid Layout

**IMPORTANT: The dashboard uses a 36-column grid system.** To fill the full width of the dashboard, set `w: 36`. Many layouts incorrectly use smaller widths like `24` or `30`, leaving empty space on the right side of the dashboard.

- **x**: Column position `(0-35)`
- **y**: Row position `(0+)`
- **w**: Width in columns `(1-36)`. **Use `36` for full-width tiles.**
- **h**: Height in rows `(minimum 1)`

### Width Quick Reference

| Layout        | Width (w) | Tiles per row |
| ------------- | --------- | ------------- |
| Full width    | 36        | 1             |
| Half width    | 18        | 2             |
| Third width   | 12        | 3             |
| Quarter width | 9         | 4             |
| Sixth width   | 6         | 6             |

**Note:** The default tile width in Lightdash is `15` columns, which is less than half the grid. When creating dashboards, always explicitly set widths to fill the available space.

### Common Layouts

**Full width (`w: 36`):**

```json
{ "x": 0, "y": 0, "w": 36, "h": 6 }
```

**Two columns (`w: 18` each, total: `36`):**

```json
[
    { "x": 0, "y": 0, "w": 18, "h": 6 },
    { "x": 18, "y": 0, "w": 18, "h": 6 }
]
```

**Three columns (`w: 12` each, total: `36`):**

```json
[
    { "x": 0, "y": 0, "w": 12, "h": 6 },
    { "x": 12, "y": 0, "w": 12, "h": 6 },
    { "x": 24, "y": 0, "w": 12, "h": 6 }
]
```

**Four columns/KPIs (`w: 9` each, total: `36`):**

```json
[
    { "x": 0, "y": 0, "w": 9, "h": 3 },
    { "x": 9, "y": 0, "w": 9, "h": 3 },
    { "x": 18, "y": 0, "w": 9, "h": 3 },
    { "x": 27, "y": 0, "w": 9, "h": 3 }
]
```

## Dashboard Tabs

**IMPORTANT:** Tab `uuid` values must be valid UUIDs (e.g., `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`), not friendly names. The linter will reject non-UUID values. Generate UUIDs with `generateUuids` tool.

Organize tiles into multiple views:

```json
{
    "tabs": [
        {
            "hidden": false,
            "name": "Overview",
            "order": 0,
            "uuid": "b3f1a2c4-d5e6-4f78-9abc-def012345678"
        },
        {
            "hidden": false,
            "name": "Details",
            "order": 1,
            "uuid": "c4d2b3e5-f6a7-4089-bcde-f12345678901"
        },
        {
            "hidden": false,
            "name": "Trends",
            "order": 2,
            "uuid": "d5e3c4f6-a7b8-4190-cdef-234567890123"
        }
    ],
    "tiles": [
        {
            "h": 6,
            "properties": {
                "chartSlug": "revenue-summary"
            },
            "tabUuid": "b3f1a2c4-d5e6-4f78-9abc-def012345678",
            "type": "saved_chart",
            "w": 36,
            "x": 0,
            "y": 0
        },
        {
            "h": 10,
            "properties": {
                "chartSlug": "detailed-breakdown"
            },
            "tabUuid": "c4d2b3e5-f6a7-4089-bcde-f12345678901",
            "type": "saved_chart",
            "w": 36,
            "x": 0,
            "y": 0
        }
    ]
}
```

**IMPORTANT:** Tab rendering depends on `tabs` and tile `tabUuid` values:

- If no tabs are defined, all tiles render in a single untabbed dashboard view.
- If tabs are defined, tiles with `"tabUuid": null` render on the default/first tab.
- Avoid relying on this defaulting behavior. When using tabs, set each tile's `tabUuid` explicitly.

Example: no tabs, so both tiles render together in one untabbed view.

```json
{
    "tabs": [],
    "tiles": [
        {
            "tabUuid": null,
            "type": "saved_chart"
        },
        {
            "tabUuid": null,
            "type": "saved_chart"
        }
    ]
}
```

Example: tabs are defined, so the `null` tile renders on `"Overview"` and the other tile renders on `"Details"`.

```json
{
    "tabs": [
        {
            "hidden": false,
            "name": "Overview",
            "order": 0,
            "uuid": "b3f1a2c4-d5e6-4f78-9abc-def012345678"
        },
        {
            "hidden": false,
            "name": "Details",
            "order": 1,
            "uuid": "c4d2b3e5-f6a7-4089-bcde-f12345678901"
        }
    ],
    "tiles": [
        {
            "tabUuid": null,
            "type": "saved_chart"
        },
        {
            "tabUuid": "c4d2b3e5-f6a7-4089-bcde-f12345678901",
            "type": "saved_chart"
        }
    ]
}
```

## Dashboard Filters

### Dimension Filters

```json
{
    "filters": {
        "dimensions": [
            {
                "disabled": false,
                "label": "Date Range",
                "operator": "inThePast",
                "required": false,
                "settings": {
                    "completed": true,
                    "unitOfTime": "months"
                },
                "target": {
                    "fieldId": "orders_created_at_month",
                    "tableName": "orders"
                },
                "values": [12]
            }
        ]
    }
}
```

### Filter Operators

| Operator             | Description           | Example Values                 |
| -------------------- | --------------------- | ------------------------------ |
| `equals`             | Exact match           | `["completed"]`                |
| `notEquals`          | Not equal             | `["cancelled"]`                |
| `isNull`             | Is null               | `[]`                           |
| `notNull`            | Is not null           | `[]`                           |
| `startsWith`         | Starts with           | `["US-"]`                      |
| `endsWith`           | Ends with             | `["-2024"]`                    |
| `include`            | Contains              | `["enterprise"]`               |
| `doesNotInclude`     | Does not contain      | `["test"]`                     |
| `lessThan`           | Less than             | `[1000]`                       |
| `lessThanOrEqual`    | Less than or equal    | `[1000]`                       |
| `greaterThan`        | Greater than          | `[0]`                          |
| `greaterThanOrEqual` | Greater than or equal | `[100]`                        |
| `inThePast`          | In the past N periods | `[30]`                         |
| `notInThePast`       | Not in the past       | `[30]`                         |
| `inTheNext`          | In the next N periods | `[7]`                          |
| `inTheCurrent`       | In current period     | `[1]`                          |
| `notInTheCurrent`    | Not in current        | `[1]`                          |
| `inBetween`          | Between two values    | `["2024-01-01", "2024-12-31"]` |
| `notInBetween`       | Not between           | `[0, 100]`                     |

### Date Filter Settings

```json
{
    "filters": {
        "dimensions": [
            {
                "operator": "inThePast",
                "settings": {
                    "completed": true,
                    "unitOfTime": "days"
                },
                "target": {
                    "fieldId": "orders_created_at",
                    "tableName": "orders"
                },
                "values": [30]
            }
        ]
    }
}
```

### Per-Tile Filter Targeting (`tileTargets`)

Use `tileTargets` when a single dashboard filter needs to apply to tiles from different explores, mapping the filter to the equivalent field in each explore. This is essential for dashboards that combine data from multiple explores.

**Key concept:** A single conceptual filter like `"Time Period"` can target different physical fields across different explores. The default `target` applies to tiles using that explore; use `tileTargets` keyed by tile slug to override for tiles using different explores.

#### Cross-Explore Filter Example

When your dashboard has tiles from multiple explores like `orders` and `customers`, map the filter to the equivalent field in each:

```json
{
    "filters": {
        "dimensions": [
            {
                "label": "Date Range",
                "operator": "inThePast",
                "settings": {
                    "completed": false,
                    "unitOfTime": "days"
                },
                "target": {
                    "fieldId": "orders_created_at",
                    "tableName": "orders"
                },
                "tileTargets": {
                    "customer-metrics": {
                        "fieldId": "customers_signup_date",
                        "tableName": "customers"
                    },
                    "revenue-summary": {
                        "fieldId": "orders_created_at",
                        "tableName": "orders"
                    },
                    "sales-by-region": {
                        "fieldId": "orders_created_at",
                        "tableName": "orders"
                    }
                },
                "values": [30]
            }
        ]
    }
}
```

#### Excluding Tiles from a Filter

Set a tile target to `false` to exclude it from the filter entirely:

```json
{
    "filters": {
        "dimensions": [
            {
                "label": "Region",
                "operator": "equals",
                "target": {
                    "fieldId": "orders_region",
                    "tableName": "orders"
                },
                "tileTargets": {
                    "company-overview": false
                },
                "values": []
            }
        ]
    }
}
```

#### Empty `tileTargets`

When all tiles use the same explore, you can leave `tileTargets` empty. The filter will apply to all tiles that have the matching field:

```json
{
    "filters": {
        "dimensions": [
            {
                "label": "Time Period",
                "operator": "inThePast",
                "settings": {
                    "completed": true,
                    "unitOfTime": "months"
                },
                "target": {
                    "fieldId": "orders_created_at",
                    "tableName": "orders"
                },
                "tileTargets": {},
                "values": [12]
            }
        ]
    }
}
```

### Required Filters

Force users to select a value:

```json
{
    "filters": {
        "dimensions": [
            {
                "label": "Select Date",
                "operator": "equals",
                "required": true,
                "target": {
                    "fieldId": "orders_date",
                    "tableName": "orders"
                },
                "values": []
            }
        ]
    }
}
```

### Single Value Filters

Restrict to single selection:

```json
{
    "filters": {
        "dimensions": [
            {
                "operator": "equals",
                "singleValue": true,
                "target": {
                    "fieldId": "orders_region",
                    "tableName": "orders"
                },
                "values": []
            }
        ]
    }
}
```

## Dashboard Configuration

Control dashboard-level settings like date zoom behavior:

```json
{
    "config": {
        "dateZoomGranularities": ["Day", "Week", "Month", "Quarter", "Year"],
        "defaultDateZoomGranularity": "Month",
        "isAddFilterDisabled": false,
        "isDateZoomDisabled": false
    }
}
```

### Config Properties

| Property                     | Type     | Description                                                                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `isDateZoomDisabled`         | boolean  | Disable the date zoom feature entirely                                                                               |
| `isAddFilterDisabled`        | boolean  | Disable the add filter button entirely                                                                               |
| `dateZoomGranularities`      | string[] | Available granularity options like `Day`, `Week`, `Month`, `Quarter`, `Year`, or custom values like `fiscal_quarter` |
| `defaultDateZoomGranularity` | string   | The granularity selected by default when the dashboard loads                                                         |
| `pinnedParameters`           | string[] | List of pinned parameter names                                                                                       |

When `config` is omitted, date zoom is enabled with all default granularities.

## Complete Dashboard Example

```json
{
    "contentType": "dashboard",
    "config": {
        "dateZoomGranularities": ["Day", "Week", "Month", "Quarter", "Year"],
        "defaultDateZoomGranularity": "Month",
        "isAddFilterDisabled": false,
        "isDateZoomDisabled": false
    },
    "description": "High-level sales performance metrics for leadership team",
    "filters": {
        "dimensions": [
            {
                "label": "Time Period",
                "operator": "inThePast",
                "settings": {
                    "completed": false,
                    "unitOfTime": "months"
                },
                "target": {
                    "fieldId": "orders_created_at",
                    "tableName": "orders"
                },
                "values": [12]
            },
            {
                "label": "Region",
                "operator": "equals",
                "singleValue": false,
                "target": {
                    "fieldId": "orders_region",
                    "tableName": "orders"
                },
                "values": []
            },
            {
                "label": "Customer Segment",
                "operator": "equals",
                "target": {
                    "fieldId": "orders_segment",
                    "tableName": "orders"
                },
                "values": []
            }
        ]
    },
    "name": "Executive Sales Dashboard",
    "slug": "executive-sales-dashboard",
    "spaceSlug": "leadership",
    "tabs": [
        {
            "hidden": false,
            "name": "Overview",
            "order": 0,
            "uuid": "e6f4d5a7-b8c9-4201-def0-345678901234"
        },
        {
            "hidden": false,
            "name": "By Region",
            "order": 1,
            "uuid": "f7a5e6b8-c9d0-4312-ef01-456789012345"
        },
        {
            "hidden": false,
            "name": "By Product",
            "order": 2,
            "uuid": "a8b6f7c9-d0e1-4423-f012-567890123456"
        }
    ],
    "tiles": [
        {
            "h": 3,
            "properties": {
                "chartSlug": "total-revenue-kpi",
                "title": "Total Revenue"
            },
            "tabUuid": "overview-tab",
            "type": "saved_chart",
            "w": 9,
            "x": 0,
            "y": 0
        },
        {
            "h": 3,
            "properties": {
                "chartSlug": "total-orders-kpi",
                "title": "Total Orders"
            },
            "tabUuid": "overview-tab",
            "type": "saved_chart",
            "w": 9,
            "x": 9,
            "y": 0
        },
        {
            "h": 3,
            "properties": {
                "chartSlug": "new-customers-kpi",
                "title": "New Customers"
            },
            "tabUuid": "overview-tab",
            "type": "saved_chart",
            "w": 9,
            "x": 18,
            "y": 0
        },
        {
            "h": 3,
            "properties": {
                "chartSlug": "avg-order-value-kpi",
                "title": "Avg Order Value"
            },
            "tabUuid": "overview-tab",
            "type": "saved_chart",
            "w": 9,
            "x": 27,
            "y": 0
        },
        {
            "h": 8,
            "properties": {
                "chartSlug": "revenue-trend",
                "title": "Revenue Trend"
            },
            "tabUuid": "overview-tab",
            "type": "saved_chart",
            "w": 24,
            "x": 0,
            "y": 3
        },
        {
            "h": 8,
            "properties": {
                "content": "## This Month\n\n- Revenue tracking **+12%** vs target\n- Strong growth in Enterprise segment\n- APAC expansion on track\n\n## Actions\n\n1. Review underperforming regions\n2. Accelerate Q4 campaigns\n3. Monitor churn in SMB",
                "title": "Key Insights"
            },
            "tabUuid": "overview-tab",
            "type": "markdown",
            "w": 12,
            "x": 24,
            "y": 3
        },
        {
            "h": 1,
            "properties": {
                "text": "Regional Performance"
            },
            "tabUuid": "by-region-tab",
            "type": "heading",
            "w": 36,
            "x": 0,
            "y": 0
        },
        {
            "h": 8,
            "properties": {
                "chartSlug": "revenue-by-region"
            },
            "tabUuid": "by-region-tab",
            "type": "saved_chart",
            "w": 18,
            "x": 0,
            "y": 1
        },
        {
            "h": 8,
            "properties": {
                "chartSlug": "regional-trend"
            },
            "tabUuid": "by-region-tab",
            "type": "saved_chart",
            "w": 18,
            "x": 18,
            "y": 1
        },
        {
            "h": 6,
            "properties": {
                "chartSlug": "revenue-by-product-category"
            },
            "tabUuid": "by-product-tab",
            "type": "saved_chart",
            "w": 36,
            "x": 0,
            "y": 0
        },
        {
            "h": 8,
            "properties": {
                "chartSlug": "product-performance-table"
            },
            "tabUuid": "by-product-tab",
            "type": "saved_chart",
            "w": 36,
            "x": 0,
            "y": 6
        }
    ],
    "version": 1
}
```

## Dashboard Best Practices

### Layout

1. **Start with KPIs**: Top row for key metrics
2. **Flow logically**: Overview → Details → Drill-downs
3. **Use consistent sizing**: Align to grid, avoid odd sizes
4. **Group related content**: Use tabs or visual separation
5. **Leave breathing room**: Don't cram everything in

### Content

1. **Tell a story**: Dashboard should answer key questions
2. **Limit charts**: 5-10 per view/tab
3. **Use markdown**: Explain context and insights
4. **Include videos**: Loom for walkthroughs
5. **Add headings**: Separate sections clearly

### Filters

1. **Provide useful defaults**: Start with meaningful data
2. **Limit filter count**: 3-5 primary filters
3. **Use appropriate operators**: Date ranges vs. exact matches
4. **Consider required filters**: When context is needed
5. **Target filters correctly**: Not all filters apply to all charts
6. **Use tileTargets for multi-explore dashboards**: When tiles come from different explores, use `tileTargets` to map the filter to the equivalent field in each explore

### Filter Troubleshooting

**Problem: Dashboard filter isn't applying to some tiles**

This usually happens when those tiles use a different explore than the filter's `target`. The filter only auto-applies to tiles with a matching `fieldId` and `tableName`.

**Solution:** Add `tileTargets` entries for tiles using different explores:

```json
{
    "filters": {
        "dimensions": [
            {
                "target": {
                    "fieldId": "orders_date",
                    "tableName": "orders"
                },
                "tileTargets": {
                    "customer-chart": {
                        "fieldId": "customers_date",
                        "tableName": "customers"
                    }
                }
            }
        ]
    }
}
```

**Problem: Filter applies to a tile when it shouldn't**

**Solution:** Explicitly exclude the tile:

```json
{
    "tileTargets": {
        "summary-tile": false
    }
}
```

### Performance

1. **Optimize chart queries**: Appropriate limits and filters
2. **Avoid too many tiles**: More tiles = slower load
3. **Use tabs**: Split large dashboards
4. **Pre-filter data**: Remove unnecessary rows in models

### Maintenance

1. **Document purpose**: Clear descriptions
2. **Review regularly**: Remove stale content
3. **Test filters**: Ensure they work as expected
