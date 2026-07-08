---
name: cartesian-chart-reference
description: Bar, line, area, and scatter chart configuration, layout, series options, and examples for Lightdash charts.
---

# Cartesian Chart Reference

## Overview

Cartesian charts in Lightdash provide flexible visualization options for displaying relationships between dimensions and metrics on X and Y axes. They support four series types:

- **Bar charts**: Compare values across categories with vertical or horizontal bars
- **Line charts**: Show trends and changes over time with connected data points
- **Area charts**: Display cumulative values and trends with filled areas under lines
- **Scatter charts**: Reveal correlations and distributions with individual data points

Cartesian charts support:

- Multiple series with different visualization types
- Stacking (for bar and area charts)
- Dual Y-axes for comparing metrics with different scales
- Reference lines for highlighting thresholds or targets
- Flexible axis configuration and styling

## Basic Structure

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "series": [
                    {
                        "encode": {
                            "xRef": {
                                "field": "my_explore_category"
                            },
                            "yRef": {
                                "field": "my_explore_total_sales"
                            }
                        },
                        "type": "bar"
                    }
                ]
            },
            "layout": {
                "xField": "my_explore_category",
                "yField": ["my_explore_total_sales"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["my_explore_category"],
        "exploreName": "my_explore",
        "filters": {},
        "limit": 500,
        "metrics": ["my_explore_total_sales"],
        "sorts": []
    },
    "name": "My Cartesian Chart",
    "slug": "my-cartesian-chart",
    "spaceSlug": "analytics",
    "tableName": "my_explore",
    "version": 1
}
```

## Key Configuration Properties

### `layout`

- **`xField`**: Field ID for the X axis (typically a dimension)
- **`yField`**: Array of field IDs for the Y axis
- **`flipAxes`**: Swap X and Y axes for horizontal bar charts (default: `false`)
- **`showGridX`** / **`showGridY`**: Show grid lines
- **`stack`**: Stacking mode for bar/area charts: `"stack"` for normal stacking, `"stack100"` for 100% stacking, `"none"` or omitted for no stacking
- **`colorByCategory`**: Color each bar by its x-axis category value instead of using a single series color (default: `false`). Use this instead of adding a pivot/group-by dimension just for coloring.
- **`categoryColorOverrides`**: Map of category value to hex color (e.g., `{"McLaren": "#FF8700"}`). Only applies when `colorByCategory` is `true`.

### `eChartsConfig`

- **`series`**: Array of series configurations (required)
- **`xAxis`** / **`yAxis`**: Axis configuration arrays
- **`legend`**: Legend display and positioning
- **`grid`**: Chart area padding
- **`tooltip`** / **`tooltipSort`**: Tooltip behavior

### Series Configuration

Each series requires:

- **`type`**: `"bar"`, `"line"`, `"area"`, or `"scatter"`
- **`encode`**: Field references with `xRef` and `yRef`

Optional properties:

- **`name`**: Display name in legend
- **`color`**: Hex color code
- **`yAxisIndex`**: Which Y axis (0 or 1)
- **`stack`**: ECharts stack group name. For stacked area/bar charts, set this on every stacked series.
- **`smooth`**: Smooth curves for line/area
- **`areaStyle`**: Presence indicates area chart
- **`markLine`**: Reference line configuration

### Limiting Displayed Rows

Use `rowLimit` to trim the rendered chart to the first or last N rows of data without changing the underlying query. This is client-side slicing on already-fetched rows — useful for "show me the top 5" or "hide the totals row" while keeping the full dataset available for exports and tooltips.

```json
{
    "chartConfig": {
        "config": {
            "rowLimit": {
                "mode": "show",
                "direction": "first",
                "count": 10
            }
        }
    }
}
```

| User intent                                                  | Config                                        |
| ------------------------------------------------------------ | --------------------------------------------- |
| "Show only the top 10 partners"                              | `{ mode: show, direction: first, count: 10 }` |
| "Hide the last row (a totals row)"                           | `{ mode: hide, direction: last, count: 1 }`   |
| "Show the bottom 5 underperformers" (assumes ascending sort) | `{ mode: show, direction: last, count: 5 }`   |

**`metricQuery.limit` vs `rowLimit`**: `metricQuery.limit` constrains how many rows are _fetched_ from the warehouse. `rowLimit` only trims what is _displayed_ from the already-fetched rows. If the user wants to scan fewer rows in the database, use `metricQuery.limit`. Use `rowLimit` when the full dataset should remain queryable but only a subset should appear in the chart.

## Examples

### Bar Chart

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "series": [
                    {
                        "encode": {
                            "xRef": {
                                "field": "orders_partner_name"
                            },
                            "yRef": {
                                "field": "orders_total_sales"
                            }
                        },
                        "type": "bar"
                    }
                ]
            },
            "layout": {
                "xField": "orders_partner_name",
                "yField": ["orders_total_sales"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_partner_name"],
        "exploreName": "orders",
        "filters": {},
        "limit": 10,
        "metrics": ["orders_total_sales"],
        "sorts": [
            {
                "descending": true,
                "fieldId": "orders_total_sales"
            }
        ]
    },
    "name": "Sales by Partner",
    "slug": "sales-by-partner",
    "spaceSlug": "sales",
    "tableName": "orders",
    "version": 1
}
```

### Bar Chart Colored by Category

Use `colorByCategory` to give each bar a distinct color based on its category value. This is preferable to adding a group-by/pivot dimension solely for coloring purposes.

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "series": [
                    {
                        "encode": {
                            "xRef": {
                                "field": "orders_product_category"
                            },
                            "yRef": {
                                "field": "orders_total_sales"
                            }
                        },
                        "type": "bar"
                    }
                ]
            },
            "layout": {
                "categoryColorOverrides": {
                    "Clothing": "#37B24D",
                    "Electronics": "#4C6EF5",
                    "Home & Garden": "#F59F00"
                },
                "colorByCategory": true,
                "xField": "orders_product_category",
                "yField": ["orders_total_sales"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_product_category"],
        "exploreName": "orders",
        "filters": {},
        "limit": 10,
        "metrics": ["orders_total_sales"],
        "sorts": [
            {
                "descending": true,
                "fieldId": "orders_total_sales"
            }
        ]
    },
    "name": "Sales by Category",
    "slug": "sales-by-category",
    "spaceSlug": "sales",
    "tableName": "orders",
    "version": 1
}
```

### Line Chart with Trend

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "series": [
                    {
                        "encode": {
                            "xRef": {
                                "field": "orders_order_date_month"
                            },
                            "yRef": {
                                "field": "orders_total_revenue"
                            }
                        },
                        "showSymbol": true,
                        "smooth": true,
                        "type": "line"
                    }
                ],
                "xAxis": [
                    {
                        "name": "Month"
                    }
                ],
                "yAxis": [
                    {
                        "name": "Revenue ($)"
                    }
                ]
            },
            "layout": {
                "showGridY": true,
                "xField": "orders_order_date_month",
                "yField": ["orders_total_revenue"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_order_date_month"],
        "exploreName": "orders",
        "filters": {},
        "limit": 500,
        "metrics": ["orders_total_revenue"],
        "sorts": [
            {
                "descending": false,
                "fieldId": "orders_order_date_month"
            }
        ]
    },
    "name": "Monthly Revenue Trend",
    "slug": "monthly-revenue-trend",
    "spaceSlug": "finance",
    "tableName": "orders",
    "version": 1
}
```

### Stacked Area Chart

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "legend": {
                    "show": true
                },
                "series": [
                    {
                        "areaStyle": {},
                        "encode": {
                            "xRef": {
                                "field": "orders_order_date_month"
                            },
                            "yRef": {
                                "field": "orders_total_revenue",
                                "pivotValues": [
                                    {
                                        "field": "orders_product_category",
                                        "value": "Electronics"
                                    }
                                ]
                            }
                        },
                        "stack": "total",
                        "type": "line"
                    }
                ]
            },
            "layout": {
                "stack": "stack",
                "xField": "orders_order_date_month",
                "yField": ["orders_total_revenue"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_order_date_month", "orders_product_category"],
        "exploreName": "orders",
        "filters": {},
        "limit": 500,
        "metrics": ["orders_total_revenue"],
        "sorts": [
            {
                "descending": false,
                "fieldId": "orders_order_date_month"
            }
        ]
    },
    "name": "Revenue by Category",
    "pivotConfig": {
        "columns": ["orders_product_category"]
    },
    "slug": "revenue-by-category",
    "spaceSlug": "sales",
    "tableName": "orders",
    "version": 1
}
```

For stacked area charts:

- Set the same `series[].stack` value on every area series. `layout.stack: "stack"` keeps Lightdash stack controls in sync, but does not stack series by itself.
- Use `type: "line"` with `areaStyle: {}`. Do not use `type: "area"`.
- If splitting one metric by a dimension, add that dimension to `metricQuery.dimensions` and `pivotConfig.columns`, then reference each pivoted series with `encode.yRef.pivotValues`.
- Only hard-code `pivotValues` for values you know exist. Missing/null combinations can make stacked area charts look broken; use a bar chart or fill missing combinations with 0 when sparse time series data is expected.

### Scatter Chart

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "series": [
                    {
                        "encode": {
                            "xRef": {
                                "field": "orders_basket_total"
                            },
                            "yRef": {
                                "field": "orders_profit"
                            }
                        },
                        "type": "scatter"
                    }
                ],
                "xAxis": [
                    {
                        "name": "Order Value ($)"
                    }
                ],
                "yAxis": [
                    {
                        "name": "Profit ($)"
                    }
                ]
            },
            "layout": {
                "xField": "orders_basket_total",
                "yField": ["orders_profit"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_order_id"],
        "exploreName": "orders",
        "filters": {},
        "limit": 1000,
        "metrics": ["orders_basket_total", "orders_profit"],
        "sorts": []
    },
    "name": "Order Value vs Profit",
    "slug": "order-value-vs-profit",
    "spaceSlug": "analytics",
    "tableName": "orders",
    "version": 1
}
```

### Dual Y-Axis Chart

```json
{
    "chartConfig": {
        "config": {
            "eChartsConfig": {
                "series": [
                    {
                        "encode": {
                            "xRef": {
                                "field": "orders_order_date_month"
                            },
                            "yRef": {
                                "field": "orders_total_revenue"
                            }
                        },
                        "name": "Revenue",
                        "type": "bar",
                        "yAxisIndex": 0
                    },
                    {
                        "encode": {
                            "xRef": {
                                "field": "orders_order_date_month"
                            },
                            "yRef": {
                                "field": "profit_margin"
                            }
                        },
                        "name": "Profit Margin",
                        "smooth": true,
                        "type": "line",
                        "yAxisIndex": 1
                    }
                ],
                "yAxis": [
                    {
                        "name": "Revenue ($)"
                    },
                    {
                        "name": "Profit Margin (%)"
                    }
                ]
            },
            "layout": {
                "xField": "orders_order_date_month",
                "yField": ["orders_total_revenue", "profit_margin"]
            }
        },
        "type": "cartesian"
    },
    "contentType": "chart",
    "metricQuery": {
        "dimensions": ["orders_order_date_month"],
        "exploreName": "orders",
        "filters": {},
        "limit": 500,
        "metrics": ["orders_total_revenue"],
        "sorts": [
            {
                "descending": false,
                "fieldId": "orders_order_date_month"
            }
        ],
        "tableCalculations": [
            {
                "displayName": "Profit Margin %",
                "name": "profit_margin",
                "sql": "${orders.profit}/${orders.total_revenue} * 100"
            }
        ]
    },
    "name": "Revenue & Profit Margin",
    "slug": "revenue-profit-margin",
    "spaceSlug": "finance",
    "tableName": "orders",
    "version": 1
}
```

## Tips

1. **Match `metricQuery.dimensions` to chart config — no extras.** Every dimension in `metricQuery.dimensions` must appear in exactly one of: `layout.xField`, `layout.yField`, or `pivotConfig.columns`. An unused dimension silently adds a GROUP BY clause to the SQL, inflating row counts and producing incorrect metric values. Lightdash flags this as a "Results may be incorrect" warning.

    ```json
    {
        "chartConfig": {
            "config": {
                "layout": {
                    "xField": "orders_order_date_month",
                    "yField": ["orders_total_revenue"]
                }
            },
            "type": "cartesian"
        },
        "metricQuery": {
            "dimensions": ["orders_order_date_month"],
            "metrics": ["orders_total_revenue"]
        },
        "pivotConfig": {
            "columns": ["orders_status"]
        }
    }
    ```

```

2. **Choose the right chart type**:
   - Bar: Comparing discrete categories
   - Line: Showing trends over time
   - Area: Emphasizing cumulative totals or composition
   - Scatter: Exploring correlations between variables

2. **Stacking**: Use the same `series[].stack` value for series you want stacked. `layout.stack: "stack"` alone does not stack series. Only bar and area charts support stacking.

3. **Dual Y-axis**: Use `yAxisIndex: 0` for left axis, `yAxisIndex: 1` for right axis.

4. **Horizontal bars**: Set `flipAxes: true` in layout.

5. **Pivot data**: Use `pivotValues` in `yRef` to create series from pivoted dimensions.

6. **Reference lines**: Add `markLine` to series for targets or thresholds.

7. **Grid spacing**: Use `grid.containLabel: true` to prevent label clipping.

```
