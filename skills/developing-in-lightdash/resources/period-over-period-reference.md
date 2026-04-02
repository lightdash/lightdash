# Period over Period (PoP) Comparison Reference

## Overview

Period over Period comparison adds a "previous period" version of any metric to your chart. For example, show this month's revenue alongside last month's revenue, or this year's order count next to last year's.

PoP is implemented through **additional metrics** in the `metricQuery`. You define an additional metric with `generationType: periodOverPeriod` that references a base metric and a time dimension, then Lightdash automatically offsets the time window to pull comparison data.

## Supported Granularities

| Granularity | Example Comparison |
|-------------|-------------------|
| `DAY` | Yesterday vs today |
| `WEEK` | Last week vs this week |
| `MONTH` | Last month vs this month |
| `QUARTER` | Last quarter vs this quarter |
| `YEAR` | Last year vs this year |

## YAML Structure

### The PoP Additional Metric

Add a PoP metric to `metricQuery.additionalMetrics`:

```yaml
metricQuery:
  additionalMetrics:
    - baseMetricId: <explore>_<base_metric_name>    # Field ID of the metric to compare
      generationType: periodOverPeriod               # Required: marks this as PoP
      granularity: YEAR                              # DAY, WEEK, MONTH, QUARTER, or YEAR
      hidden: true                                   # PoP metrics are hidden from the sidebar
      label: "Order Count (Previous year)"           # Display label
      name: <metric_name>__pop__<granularity>_<offset>__<hash>  # Deterministic name (see naming)
      periodOffset: 1                                # How many periods back (1 = previous)
      sql: "${TABLE}.column_name"                    # Same SQL as the base metric
      table: <explore_name>                          # Table the metric belongs to
      timeDimensionId: <explore>_<time_dim>_<grain>  # Time dimension field ID with grain
      type: count                                    # Same type as the base metric (sum, count, average, etc.)
```

### Including the PoP Metric in the Query

The PoP metric's field ID must appear in `metricQuery.metrics`:

```yaml
metricQuery:
  metrics:
    - country_orders_order_count                              # Base metric
    - country_orders_order_count__pop__year_1__lqse0r         # PoP metric field ID
```

The field ID format is: `<table>_<metric_name>` where `<metric_name>` is the deterministic name from the additional metric.

## Key Properties

| Property | Required | Description |
|----------|----------|-------------|
| `baseMetricId` | Yes | Field ID of the original metric (e.g., `orders_total_revenue`) |
| `generationType` | Yes | Must be `periodOverPeriod` |
| `granularity` | Yes | Time granularity: `DAY`, `WEEK`, `MONTH`, `QUARTER`, `YEAR` |
| `hidden` | Yes | Always `true` — PoP metrics don't appear in the sidebar |
| `label` | Yes | Display name (e.g., "Revenue (Previous month)") |
| `name` | Yes | Deterministic name with hash suffix |
| `periodOffset` | Yes | Number of periods back (1 = previous period, 2 = two periods ago) |
| `sql` | Yes | Same SQL expression as the base metric |
| `table` | Yes | Table/explore name |
| `timeDimensionId` | Yes | Field ID of the time dimension including grain suffix |
| `type` | Yes | Same aggregation type as base metric (`sum`, `count`, `average`, etc.) |
| `format` | No | Number format (e.g., `usd`, `percent`) — copy from base metric |
| `round` | No | Decimal places — copy from base metric |

## Metric Name Generation

PoP metric names follow a deterministic pattern:

```
<base_metric_name>__pop__<granularity>_<periodOffset>__<hash>
```

Where `<hash>` is a base-36 hash of `<timeDimensionId>|<granularity>|<periodOffset>`.

### Computing the Hash

The hash uses a polynomial rolling hash (base 31, modulo 2^31-1) converted to base-36:

```javascript
// Input string: `${timeDimensionId}|${granularity}|${periodOffset}`
// Example: "country_orders_order_date_year|YEAR|1"
const MODULUS = 2147483647; // 2^31 - 1
const BASE = 31;
let hash = 0;
for (let i = 0; i < input.length; i++) {
  hash = (hash * BASE + input.charCodeAt(i)) % MODULUS;
}
const suffix = hash.toString(36).padStart(6, '0');
```

Quick Node.js one-liner:

```bash
node -e "
const input = 'country_orders_order_date_year|YEAR|1';
let h=0; for(let i=0;i<input.length;i++) h=(h*31+input.charCodeAt(i))%2147483647;
console.log(h.toString(36).padStart(6,'0'));
"
```

## Complete Example: Year-over-Year Table Chart

```yaml
chartConfig:
  config:
    columns:
      country_orders_country:
        frozen: true
        name: Country
        visible: true
      country_orders_order_count:
        name: Order Count
        visible: true
      country_orders_order_count__pop__year_1__lqse0r:
        name: Order Count (Previous Year)
        visible: true
      country_orders_order_date_year:
        name: Year
        visible: true
    conditionalFormattings: []
    hideRowNumbers: false
    metricsAsRows: false
    showColumnCalculation: true
    showResultsTotal: false
    showRowCalculation: false
    showSubtotals: false
    showTableNames: false
  type: table
contentType: chart
description: >-
  Compares total order count per country across years using period-over-period
  comparison. Shows current year orders alongside previous year orders in a
  table.
metricQuery:
  additionalMetrics:
    - baseMetricId: country_orders_order_count
      generationType: periodOverPeriod
      granularity: YEAR
      hidden: true
      label: Order Count (Previous year)
      name: order_count__pop__year_1__lqse0r
      periodOffset: 1
      sql: "${TABLE}.order_id"
      table: country_orders
      timeDimensionId: country_orders_order_date_year
      type: count
  customDimensions: []
  dimensions:
    - country_orders_country
    - country_orders_order_date_year
  exploreName: country_orders
  filters: {}
  limit: 500
  metrics:
    - country_orders_order_count
    - country_orders_order_count__pop__year_1__lqse0r
  sorts:
    - descending: true
      fieldId: country_orders_order_date_year
    - descending: false
      fieldId: country_orders_country
  tableCalculations: []
name: Country Orders - Year over Year Comparison
slug: country-orders-yoy-comparison
spaceSlug: jaffle-shop
tableConfig:
  columnOrder:
    - country_orders_country
    - country_orders_order_date_year
    - country_orders_order_count
    - country_orders_order_count__pop__year_1__lqse0r
tableName: country_orders
version: 1
```

## Using PoP with Different Chart Types

### Table Charts

PoP columns appear as additional metric columns. Null values (where no comparison data exists) display as `∅`. Use `showColumnCalculation: true` to show totals.

### Cartesian Charts (Line, Bar, Area)

Add the PoP metric to `layout.yField` and create a separate series in `eChartsConfig.series`:

```yaml
chartConfig:
  config:
    eChartsConfig:
      series:
        - encode:
            xRef:
              field: orders_order_date_month
            yRef:
              field: orders_total_revenue
          type: line
        - encode:
            xRef:
              field: orders_order_date_month
            yRef:
              field: orders_total_revenue__pop__month_1__<hash>
          type: line
    layout:
      xField: orders_order_date_month
      yField:
        - orders_total_revenue
        - orders_total_revenue__pop__month_1__<hash>
  type: cartesian
```

### Big Number Charts

PoP can power the comparison value in big number charts, showing the delta from the previous period.

## Workflow: Adding PoP via UI then Managing as Code

1. Create the base chart in the Lightdash UI
2. Click on a metric column header in the results table
3. Select **Add period comparison**
4. Choose the time dimension and offset, then save
5. Download with `lightdash download --charts <slug>`
6. The YAML will contain the complete `additionalMetrics` configuration
7. Manage as code going forward with `lightdash upload`

## Common Patterns

### Month-over-Month Revenue

```yaml
additionalMetrics:
  - baseMetricId: orders_total_revenue
    generationType: periodOverPeriod
    granularity: MONTH
    periodOffset: 1
    timeDimensionId: orders_order_date_month
    # ... other required fields
```

### Same Quarter Last Year

```yaml
additionalMetrics:
  - baseMetricId: orders_total_revenue
    generationType: periodOverPeriod
    granularity: YEAR
    periodOffset: 1
    timeDimensionId: orders_order_date_quarter
    # ... other required fields
```

### Comparing to 3 Months Ago

```yaml
additionalMetrics:
  - baseMetricId: orders_total_revenue
    generationType: periodOverPeriod
    granularity: MONTH
    periodOffset: 3
    timeDimensionId: orders_order_date_month
    # ... other required fields
```

## Important Notes

- The time dimension in `dimensions` must match the grain referenced by `timeDimensionId`. For year-over-year, use `_year` suffix; for month-over-month, use `_month`.
- Countries/categories that only exist in one period will show `∅` (null) for the comparison column — this is expected behavior.
- PoP metrics must be listed in both `additionalMetrics` and `metrics` arrays.
- YAML keys must be sorted alphabetically for `lightdash upload` to accept the file.
