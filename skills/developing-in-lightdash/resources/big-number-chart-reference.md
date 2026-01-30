# Big Number Chart Reference

## Overview

Big number charts (also called KPI displays) in Lightdash provide a prominent display of a single metric value, making them ideal for:

- **Key Performance Indicators (KPIs)**: Display critical business metrics at a glance (e.g., monthly revenue, active users)
- **Dashboards**: Create executive dashboards with headline numbers
- **Period-over-period comparison**: Show how a metric has changed compared to a previous period
- **Alert monitoring**: Highlight important metrics with color-coded change indicators
- **Compact displays**: Show large numbers in readable formats (e.g., 1.2M instead of 1,234,567)

Big number charts display a single numeric value prominently, with optional comparison to show change over time and customizable number formatting.

## Basic Structure

```yaml
version: 1
name: "My Big Number"
slug: "my-big-number"
spaceSlug: "analytics"
tableName: "my_explore"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "my_explore_total_revenue"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "my_explore_total_revenue"
      label: "Total Revenue"
      showBigNumberLabel: true
```

## Configuration Options

### `bigNumber` (object, optional)

The main configuration object for big number chart settings. All properties are optional.

#### Core Settings

- **`selectedField`** (string): Field ID to display as the big number. This should be a metric from your `metricQuery`.

- **`label`** (string): Custom label for the big number. If not provided, the field name will be used.

#### Display Settings

- **`showBigNumberLabel`** (boolean): Whether to show the label above the number. Default is typically `true`.

- **`showTableNamesInLabel`** (boolean): Whether to include the table name in the label (e.g., "Sales Metrics - Revenue" vs. "Revenue").

#### Number Formatting

- **`style`** (string): Number formatting style for compact notation. Converts large numbers to more readable formats.
  - Options: `"thousands"`, `"millions"`, `"billions"`, `"trillions"`, `"K"`, `"M"`, `"B"`, `"T"`
  - Examples:
    - `"thousands"` or `"K"`: 1500 → 1.5K
    - `"millions"` or `"M"`: 1500000 → 1.5M
    - `"billions"` or `"B"`: 1500000000 → 1.5B
    - `"trillions"` or `"T"`: 1500000000000 → 1.5T

#### Comparison Settings

- **`showComparison`** (boolean): Whether to show comparison with a previous value (period-over-period change).

- **`comparisonFormat`** (string): Format for the comparison value.
  - `"raw"`: Show absolute change (e.g., +500)
  - `"percentage"`: Show percentage change (e.g., +12.5%)

- **`comparisonLabel`** (string): Custom label for the comparison value (e.g., "vs. Last Month").

- **`flipColors`** (boolean): Reverse the color scheme for comparison indicators. By default:
  - Green = increase (positive change)
  - Red = decrease (negative change)

  When `flipColors: true`:
  - Red = increase (useful for cost/error metrics where increases are bad)
  - Green = decrease (useful for cost/error metrics where decreases are good)

## Examples

### Example 1: Basic KPI

Simple big number showing total revenue:

```yaml
version: 1
name: "Total Revenue"
slug: "total-revenue"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "orders_total_revenue"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "orders_total_revenue"
      label: "Total Revenue"
      showBigNumberLabel: true
```

### Example 2: Compact Number Formatting

Display large numbers in millions with M suffix:

```yaml
version: 1
name: "Monthly Active Users"
slug: "monthly-active-users"
spaceSlug: "product"
tableName: "users"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "users_monthly_active_count"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "users_monthly_active_count"
      label: "Monthly Active Users"
      style: "M"  # Display as millions (e.g., 2.5M)
      showBigNumberLabel: true
```

### Example 3: Period-over-Period Comparison (Percentage)

Show current revenue with percentage change vs. previous period:

```yaml
version: 1
name: "Revenue with Growth"
slug: "revenue-growth"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "orders_total_revenue"
  filters:
    - target:
        fieldId: "orders_created_at"
      operator: "inThePast"
      values: [30]
      settings:
        unitOfTime: "days"
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "orders_total_revenue"
      label: "Monthly Revenue"
      style: "M"
      showBigNumberLabel: true
      showComparison: true
      comparisonFormat: "percentage"  # Show % change
      comparisonLabel: "vs. Last Month"
```

### Example 4: Raw Value Comparison

Show customer count with absolute change:

```yaml
version: 1
name: "New Customers"
slug: "new-customers"
spaceSlug: "sales"
tableName: "customers"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "customers_count"
  filters:
    - target:
        fieldId: "customers_created_at"
      operator: "inThePast"
      values: [7]
      settings:
        unitOfTime: "days"
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "customers_count"
      label: "New Customers This Week"
      showBigNumberLabel: true
      showComparison: true
      comparisonFormat: "raw"  # Show absolute change (e.g., +42)
      comparisonLabel: "vs. Last Week"
```

### Example 5: Flipped Colors for Cost Metrics

Show costs where increases are bad (red) and decreases are good (green):

```yaml
version: 1
name: "Infrastructure Costs"
slug: "infrastructure-costs"
spaceSlug: "finance"
tableName: "expenses"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "expenses_total_cost"
  filters:
    - target:
        fieldId: "expenses_date"
      operator: "inThePast"
      values: [30]
      settings:
        unitOfTime: "days"
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "expenses_total_cost"
      label: "Monthly Infrastructure Costs"
      style: "K"
      showBigNumberLabel: true
      showComparison: true
      comparisonFormat: "percentage"
      comparisonLabel: "vs. Last Month"
      flipColors: true  # Red for increase, green for decrease
```

### Example 6: Error Rate with Flipped Colors

Monitor error rates where increases are problematic:

```yaml
version: 1
name: "Error Rate"
slug: "error-rate"
spaceSlug: "engineering"
tableName: "api_logs"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "api_logs_error_rate"
  filters:
    - target:
        fieldId: "api_logs_timestamp"
      operator: "inThePast"
      values: [24]
      settings:
        unitOfTime: "hours"
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "api_logs_error_rate"
      label: "API Error Rate (24h)"
      showBigNumberLabel: true
      showComparison: true
      comparisonFormat: "percentage"
      comparisonLabel: "vs. Yesterday"
      flipColors: true  # Higher error rate = red (bad)
```

### Example 7: Multiple Format Styles

Show billions with compact notation:

```yaml
version: 1
name: "Market Capitalization"
slug: "market-cap"
spaceSlug: "finance"
tableName: "company_metrics"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "company_metrics_market_cap"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "company_metrics_market_cap"
      label: "Market Cap"
      style: "B"  # Display as billions (e.g., 1.2B)
      showBigNumberLabel: true
```

### Example 8: Without Custom Label

Use the default field name as the label:

```yaml
version: 1
name: "Active Sessions"
slug: "active-sessions"
spaceSlug: "product"
tableName: "sessions"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "sessions_active_count"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "big_number"
  config:
    bigNumber:
      selectedField: "sessions_active_count"
      showBigNumberLabel: true
      showTableNamesInLabel: false  # Hide "Sessions - " prefix
```

## Common Patterns

### Executive Dashboard KPI

For high-level metrics on executive dashboards:

```yaml
bigNumber:
  selectedField: "revenue_total"
  label: "Total Revenue"
  style: "M"  # Compact millions format
  showBigNumberLabel: true
  showComparison: true
  comparisonFormat: "percentage"
  comparisonLabel: "vs. Last Month"
```

### Cost Monitoring

For tracking costs where increases are concerning:

```yaml
bigNumber:
  selectedField: "costs_total"
  label: "Monthly Cloud Costs"
  style: "K"
  showBigNumberLabel: true
  showComparison: true
  comparisonFormat: "percentage"
  comparisonLabel: "vs. Last Month"
  flipColors: true  # Red for increase
```

### Simple Metric Display

For straightforward metric display without comparison:

```yaml
bigNumber:
  selectedField: "users_count"
  label: "Total Users"
  showBigNumberLabel: true
```

### Growth Metric with Raw Change

Show absolute change in addition to the current value:

```yaml
bigNumber:
  selectedField: "signups_count"
  label: "New Signups This Week"
  showBigNumberLabel: true
  showComparison: true
  comparisonFormat: "raw"  # Show +42 instead of +12%
  comparisonLabel: "vs. Last Week"
```

## Tips

1. **Limit to 1 row**: Big number charts display a single value, so always use `limit: 1` in your `metricQuery`.

2. **Use aggregated metrics**: Big numbers work best with aggregated values (totals, counts, averages, etc.).

3. **Choose the right style**: Use compact notation (`K`, `M`, `B`) for large numbers to improve readability:
   - Revenue in millions? Use `"M"`
   - User counts in thousands? Use `"K"`
   - Market cap in billions? Use `"B"`

4. **Flip colors appropriately**: Use `flipColors: true` for metrics where:
   - Increases are negative (costs, errors, response times)
   - Decreases are positive (churn rate, ticket backlog)

5. **Comparison context**: Always provide a `comparisonLabel` when using `showComparison` to make the context clear (e.g., "vs. Last Month", "vs. Yesterday").

6. **Percentage vs. raw**: Choose comparison format based on your audience:
   - **Percentage** (`comparisonFormat: "percentage"`): Better for understanding relative change
   - **Raw** (`comparisonFormat: "raw"`): Better when absolute numbers matter

7. **Label clarity**: Use clear, concise labels. Avoid redundant information:
   - Good: "Monthly Revenue"
   - Avoid: "Total Monthly Revenue Amount"

8. **Period-over-period setup**: For comparison to work properly, your query should:
   - Include appropriate time filters
   - Use metrics that support comparison (some metrics may need special configuration)
   - Have sufficient historical data for the comparison period

## Number Format Style Reference

| Style Value | Alias | Example Input | Example Output | Use Case |
|-------------|-------|---------------|----------------|----------|
| `"thousands"` | `"K"` | 1500 | 1.5K | Small numbers in thousands |
| `"millions"` | `"M"` | 1500000 | 1.5M | Revenue, large user counts |
| `"billions"` | `"B"` | 1500000000 | 1.5B | Market cap, large financials |
| `"trillions"` | `"T"` | 1500000000000 | 1.5T | National economies, huge datasets |

## Comparison Format Reference

| Format | Description | Example Display | Best For |
|--------|-------------|-----------------|----------|
| `"raw"` | Absolute change | +500 or -200 | Count changes, absolute growth |
| `"percentage"` | Percentage change | +12.5% or -8.3% | Relative growth, trends |

## Color Scheme Reference

### Default Colors (flipColors: false)
- **Green**: Positive change (increase)
- **Red**: Negative change (decrease)

**Use for**: Revenue, users, signups, conversions (where more is better)

### Flipped Colors (flipColors: true)
- **Red**: Positive change (increase)
- **Green**: Negative change (decrease)

**Use for**: Costs, errors, churn, response times (where less is better)
