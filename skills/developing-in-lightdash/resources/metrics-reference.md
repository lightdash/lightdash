# Metrics Reference

Metrics are aggregated calculations performed on your data. They answer questions like "how much?", "how many?", and "what's the average?".

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
| `average` | Mean of values | No |
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

```yaml
metrics:
  total_revenue:
    type: sum
    group_label: "Revenue Metrics"
```

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
          group_label: "Revenue"

        average_order_value:
          type: average
          label: "Average Order Value"
          description: "Mean order amount"
          format: "usd"
          round: 2
          group_label: "Revenue"

        max_order:
          type: max
          label: "Largest Order"
          format: "usd"
          group_label: "Revenue"

  - name: order_id
    meta:
      dimension:
        type: string
      metrics:
        order_count:
          type: count
          label: "Total Orders"
          group_label: "Volume"

        unique_customers:
          type: count_distinct
          sql: "${TABLE}.customer_id"
          label: "Unique Customers"
          group_label: "Volume"
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
6. **Group related metrics**: Use group_label for organization
7. **Handle division by zero**: Use NULLIF in custom SQL
8. **Use filters for variants**: Create filtered versions of metrics
9. **Add AI hints**: Help AI assistants use metrics correctly
10. **Cast types explicitly**: Ensure correct aggregation (e.g., `::float`)
