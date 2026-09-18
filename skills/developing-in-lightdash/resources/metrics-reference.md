# Metrics Reference

Metrics are aggregated calculations performed on your data. They answer questions like "how much?", "how many?", and "what's the average?".

## Metric Naming

**Never reuse a dimension's name for a metric.** Dimensions and metrics share a field-name namespace on each table, regardless of where the metric is declared. This applies to dbt, dbt Fusion / dbt 1.10+, and pure Lightdash YAML. A different `label` does not resolve a name collision.

Before adding a metric:

1. Read the model's existing field definitions: all dimensions (including hidden and additional dimensions), metrics on every column, and model-level metrics.
2. Default to an aggregation prefix on the source dimension name:

    | Aggregation type   | Default metric name                                  |
    | ------------------ | ---------------------------------------------------- |
    | `sum`              | `sum_<dimension>`                                    |
    | `count_distinct`   | `count_distinct_<dimension>`                         |
    | `average`          | `avg_<dimension>`                                    |
    | Other aggregations | `<aggregation>_<dimension>` (e.g. `min_<dimension>`) |

    `avg_` is a naming prefix, not a metric type: use `type: average`.

3. Check the candidate against **all** field names on that model, not just the source dimension. If it is taken, choose a descriptive alternative or append `_2`, `_3`, etc., checking again until unique. Never overwrite or rename an existing field to make room. If an existing metric already implements the requested calculation, reuse it rather than adding a duplicate.
4. Keep the source dimension and its SQL unchanged. Use the new metric name in any chart/query references you create.
5. Run `lightdash preview` and confirm the new metric is present without duplicate-field errors or skipped-metric warnings before deployment. `dbt compile` or YAML lint alone is not sufficient.

For example, a sum of `net_welcome_offer_discount_local` should be named `sum_net_welcome_offer_discount_local`, assuming that name is unused:

```yaml
models:
    - columns:
          - meta:
                dimension:
                    type: number
                metrics:
                    sum_net_welcome_offer_discount_local:
                        type: sum
            name: net_welcome_offer_discount_local
      name: orders
```

For dbt Fusion / dbt 1.10+, nest the column's `meta` under `config`. In pure Lightdash YAML, put the metric under top-level `metrics` with `sql: ${net_welcome_offer_discount_local}` and retain the source in `dimensions`.

**Optional:** If the source dimension exists only to feed the metric, suggest `hidden: true` on the dimension (`meta.dimension` / `config.meta.dimension` in dbt, or the dimension entry in pure Lightdash). Do not hide it automatically. Hidden dimensions still reserve their names; hiding is not a collision fix.

See the official [metric aggregation examples](https://docs.lightdash.com/semantic-layer/metrics#average) and [hiding fields](https://docs.lightdash.com/explore/formatting-your-fields#hiding-fields).

## Metric Locations

Metrics can be defined in two places:

### 1. Column-Level Metrics (Recommended)

Tied to a specific column:

```yaml
columns:
  - name: amount
    meta:
      dimension:
        type: number
      metrics:
        total_amount:
          type: sum
        average_amount:
          type: average
```

### 2. Model-Level Metrics

Independent metrics with custom SQL:

```yaml
models:
  - name: orders
    meta:
      metrics:
        revenue_per_customer:
          type: number
          sql: "SUM(${TABLE}.amount) / COUNT(DISTINCT ${TABLE}.customer_id)"
```

## Metric Types

### Aggregation Metrics

| Type | Description | Requires SQL |
|------|-------------|--------------|
| `count` | Count all rows | No |
| `count_distinct` | Count unique values | No |
| `sum` | Sum of values | No |
| `sum_distinct` | Sum after de-duplicating rows by `distinct_keys` | No (needs `distinct_keys:`) |
| `average` | Mean of values | No |
| `average_distinct` | Mean (average) after de-duplicating rows by `distinct_keys` | No (needs `distinct_keys:`) |
| `min` | Minimum value | No |
| `max` | Maximum value | No |
| `percentile` | Percentile value | No (needs `percentile:`) |
| `median` | Median value (50th percentile) | No |

### Custom SQL Metrics

| Type | Description | Requires SQL |
|------|-------------|--------------|
| `number` | Custom numeric calculation | Yes |
| `string` | Custom string result | Yes |
| `date` | Custom date result | Yes |
| `timestamp` | Custom timestamp result | Yes |
| `boolean` | Custom boolean result | Yes |

### Derived Metrics

| Type | Description |
|------|-------------|
| `percent_of_previous` | Percentage change from previous row |
| `percent_of_total` | Percentage of column total |
| `running_total` | Cumulative sum |

## Configuration Options

### Basic Configuration

```yaml
metrics:
  total_revenue:
    type: sum
    label: "Total Revenue"
    description: "Sum of all order amounts"
    hidden: false
```

### Formatting

```yaml
metrics:
  total_revenue:
    type: sum
    round: 2                    # Decimal places
    format: "usd"               # Format preset
    compact: "millions"         # Compact display
```

**Format Presets:**
- Currency: `usd`, `gbp`, `eur`
- Percentage: `percent`
- Distance: `km`, `mi`
- ID: `id` (no formatting)

**Compact Options:**
- Numbers: `thousands`, `millions`, `billions`, `trillions`
- Bytes: `kilobytes`, `megabytes`, `gigabytes`, `terabytes`

### Percentile Configuration

```yaml
metrics:
  p95_response_time:
    type: percentile
    percentile: 95              # Required for percentile type
    label: "P95 Response Time"
```

### Distinct Aggregation Configuration

`sum_distinct` and `average_distinct` aggregate a column **after de-duplicating rows by one or more dimensions**. Useful for wide tables where a value is repeated across multiple rows (e.g. an order total denormalized onto every line item) and you want to count it only once per `distinct_keys` value.

`distinct_keys` accepts a single dimension reference or a list:

```yaml
columns:
  - name: order_total
    meta:
      dimension:
        type: number
      metrics:
        # Single key — sum each order_id once
        revenue:
          type: sum_distinct
          distinct_keys: order_id

        # Composite key — array form
        revenue_by_order_and_currency:
          type: sum_distinct
          distinct_keys:
            - order_id
            - currency_code

        # Same syntax for averages
        average_order_value:
          type: average_distinct
          distinct_keys: order_id
```

Defined at the model level with `sql:` (not tied to a single column):

```yaml
models:
  - name: order_lines
    meta:
      metrics:
        revenue:
          type: sum_distinct
          sql: "${TABLE}.order_total"
          distinct_keys: order_id

        average_order_value:
          type: average_distinct
          sql: "${TABLE}.order_total"
          distinct_keys: order_id
```

### Metric Filters

Apply filters to specific metrics:

```yaml
metrics:
  completed_orders:
    type: count
    label: "Completed Orders"
    filters:
      - status: "completed"

  # Multiple filter conditions
  high_value_completed:
    type: count
    filters:
      - status: "completed"
      - amount: "> 1000"
```

**Filter Operators:**
- Equality: `value`, `"value"`
- Comparison: `"> 100"`, `"< 50"`, `">= 10"`, `"<= 100"`
- Multiple values: `["value1", "value2"]`
- Null checks: `"null"`, `"!null"`
- Date intervals: `"inThePast N days"`, `"inTheNext N months"` (supports: `days`, `weeks`, `months`, `years`)

**Date filter examples:**

```yaml
metrics:
  recent_orders:
    type: count
    filters:
      - created_at: "inThePast 30 days"

  upcoming_renewals:
    type: count
    filters:
      - renewal_date: "inTheNext 7 days"
```

**Important:** `inTheCurrent` is NOT a valid operator in metric definition filters. It is only available in chart and dashboard filters. If you need current-period logic in a metric, use custom SQL with date truncation instead.

### Show Underlying Values

Configure which fields appear when users drill into a metric:

```yaml
metrics:
  total_revenue:
    type: sum
    show_underlying_values:
      - order_id
      - customer_name
      - amount
      - created_at
```

### Organization

Use `groups` to organize metrics in the sidebar:

```yaml
metrics:
  total_revenue:
    type: sum
    groups:
      - "Revenue Metrics"
```

For hierarchical grouping, add multiple levels:

```yaml
metrics:
  total_revenue:
    type: sum
    groups:
      - "Financial"
      - "Revenue"
```

> **Note:** `group_label` is deprecated. Use `groups` instead.

### URLs

Add clickable links to metric values:

```yaml
metrics:
  order_count:
    type: count
    urls:
      - label: "View Orders"
        url: "/orders?customer_id=${row.customer_id}"
```

### Access Control

```yaml
metrics:
  confidential_revenue:
    type: sum
    required_attributes:
      role: "finance"
```

### AI Hints

```yaml
metrics:
  total_revenue:
    type: sum
    ai_hint: "Primary revenue metric - use for financial reporting"
```

### Tags

```yaml
metrics:
  total_revenue:
    type: sum
    tags:
      - "finance"
      - "kpi"
```

### Default Time Dimension

Associate a metric with a time dimension:

```yaml
metrics:
  total_revenue:
    type: sum
    default_time_dimension:
      field: created_at
      interval: MONTH
```

## Custom SQL Metrics

### Model-Level Custom Metrics

```yaml
models:
  - name: orders
    meta:
      metrics:
        # Revenue per customer
        revenue_per_customer:
          type: number
          sql: "SUM(${TABLE}.amount) / NULLIF(COUNT(DISTINCT ${TABLE}.customer_id), 0)"
          round: 2
          format: "usd"

        # Conversion rate
        conversion_rate:
          type: number
          sql: "COUNT(CASE WHEN ${TABLE}.status = 'completed' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100"
          round: 1
          description: "Percentage of orders that completed"

        # Year-over-year growth (requires window functions)
        yoy_growth:
          type: number
          sql: |
            (SUM(${TABLE}.amount) - LAG(SUM(${TABLE}.amount)) OVER (ORDER BY DATE_TRUNC('year', ${TABLE}.created_at)))
            / NULLIF(LAG(SUM(${TABLE}.amount)) OVER (ORDER BY DATE_TRUNC('year', ${TABLE}.created_at)), 0) * 100
```

### Referencing Other Tables

Use table references in SQL:

```yaml
metrics:
  customer_order_total:
    type: number
    sql: "SUM(${orders.amount})"  # Reference joined table
```

## Complete Examples

### E-commerce Metrics

```yaml
columns:
  - name: amount
    meta:
      dimension:
        type: number
        format: "usd"
      metrics:
        total_revenue:
          type: sum
          label: "Total Revenue"
          description: "Sum of all order amounts"
          format: "usd"
          round: 2
          show_underlying_values:
            - order_id
            - customer_name
            - amount
          groups:
            - "Revenue"

        average_order_value:
          type: average
          label: "Average Order Value"
          description: "Mean order amount"
          format: "usd"
          round: 2
          groups:
            - "Revenue"

        max_order:
          type: max
          label: "Largest Order"
          format: "usd"
          groups:
            - "Revenue"

  - name: order_id
    meta:
      dimension:
        type: string
      metrics:
        order_count:
          type: count
          label: "Total Orders"
          groups:
            - "Volume"

        unique_customers:
          type: count_distinct
          sql: "${TABLE}.customer_id"
          label: "Unique Customers"
          groups:
            - "Volume"
```

### SaaS Metrics

```yaml
models:
  - name: subscriptions
    meta:
      metrics:
        mrr:
          type: sum
          sql: "${TABLE}.monthly_amount"
          label: "MRR"
          description: "Monthly Recurring Revenue"
          format: "usd"
          compact: "thousands"

        arr:
          type: number
          sql: "SUM(${TABLE}.monthly_amount) * 12"
          label: "ARR"
          description: "Annual Recurring Revenue"
          format: "usd"
          compact: "millions"

        churn_rate:
          type: number
          sql: |
            COUNT(CASE WHEN ${TABLE}.status = 'churned' THEN 1 END)::float
            / NULLIF(COUNT(*), 0) * 100
          label: "Churn Rate"
          round: 2
          description: "Percentage of churned subscriptions"

        avg_contract_value:
          type: average
          sql: "${TABLE}.contract_value"
          label: "ACV"
          description: "Average Contract Value"
          format: "usd"

    columns:
      - name: customer_id
        meta:
          dimension:
            type: string
          metrics:
            customer_count:
              type: count_distinct
              label: "Total Customers"

      - name: contract_value
        meta:
          dimension:
            type: number
            format: "usd"
          metrics:
            total_contract_value:
              type: sum
            median_contract_value:
              type: median
            p90_contract_value:
              type: percentile
              percentile: 90
```

### Marketing Metrics

```yaml
models:
  - name: campaigns
    meta:
      metrics:
        total_spend:
          type: sum
          sql: "${TABLE}.spend"
          format: "usd"

        total_conversions:
          type: sum
          sql: "${TABLE}.conversions"

        cpa:
          type: number
          sql: "SUM(${TABLE}.spend) / NULLIF(SUM(${TABLE}.conversions), 0)"
          label: "Cost Per Acquisition"
          format: "usd"
          round: 2

        roas:
          type: number
          sql: "SUM(${TABLE}.revenue) / NULLIF(SUM(${TABLE}.spend), 0)"
          label: "ROAS"
          description: "Return on Ad Spend"
          round: 2

        ctr:
          type: number
          sql: "SUM(${TABLE}.clicks)::float / NULLIF(SUM(${TABLE}.impressions), 0) * 100"
          label: "Click-Through Rate"
          round: 2
          description: "Percentage of impressions that resulted in clicks"
```

## Best Practices

1. **Use column-level metrics when possible**: Ties metrics to their source data
2. **Add meaningful descriptions**: Help users understand calculations
3. **Set appropriate rounding**: Usually 0-2 decimal places
4. **Use format presets**: Consistent display across metrics
5. **Configure show_underlying_values**: Enable useful drill-down
6. **Group related metrics**: Use `groups` for organization (supports hierarchical grouping)
7. **Handle division by zero**: Use NULLIF in custom SQL
8. **Use filters for variants**: Create filtered versions of metrics
9. **Add AI hints**: Help AI assistants use metrics correctly
10. **Cast types explicitly**: Ensure correct aggregation (e.g., `::float`)