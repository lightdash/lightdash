# Big Number Chart Reference

Displays a single metric value prominently, with optional comparison to a previous period.

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/bigNumber`.

## Basic Structure

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
    selectedField: "orders_total_revenue"
    label: "Total Revenue"
    style: "M"
    showBigNumberLabel: true
```

## Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `selectedField` | string | Field ID to display (must be in `metricQuery.metrics`) |
| `label` | string | Custom label (defaults to field name) |
| `showBigNumberLabel` | boolean | Show label above the number |
| `showTableNamesInLabel` | boolean | Include table name in label |
| `style` | `"K"`, `"M"`, `"B"`, `"T"` | Compact number formatting (thousands, millions, billions, trillions) |
| `showComparison` | boolean | Show change vs. previous row — see [Comparisons](#comparisons) |
| `comparisonFormat` | `"raw"` or `"percentage"` | Absolute change or percentage change |
| `comparisonLabel` | string | Label for the comparison (e.g., "vs. Last Month") |
| `flipColors` | boolean | Reverse colors: red for increase, green for decrease (use for costs, errors, churn) |
| `conditionalFormattings` | array | Color the big number value based on conditions — see [Conditional Formatting](#conditional-formatting) |

## Conditional Formatting

Changes the color of the big number text based on rules. Each rule has a `color` (hex), optional `darkColor` for dark mode, and one or more conditions. Multiple conditions within a rule are **AND**-ed. If multiple rules match, the **last** matching rule wins.

```yaml
chartConfig:
  type: "big_number"
  config:
    selectedField: "orders_total_revenue"
    label: "Total Revenue"
    style: "M"
    showBigNumberLabel: true
    conditionalFormattings:
      # Turn red when revenue drops below 100,000
      - color: "#EF4444"
        darkColor: "#F87171"
        rules:
          - id: "low-revenue"
            operator: "lessThan"
            values: [100000]
      # Turn green when revenue exceeds 1,000,000
      - color: "#10B981"
        darkColor: "#34D399"
        rules:
          - id: "high-revenue"
            operator: "greaterThan"
            values: [1000000]
```

### Rule Structure

Each rule in the `rules` array:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier for the rule |
| `operator` | string | Comparison operator (see below) |
| `values` | array | Values to compare against |

### Operators

**Numeric**: `equals`, `notEquals`, `lessThan`, `lessThanOrEqual`, `greaterThan`, `greaterThanOrEqual`, `inBetween`, `notInBetween`, `isNull`, `notNull`

**String**: `equals`, `notEquals`, `include`, `doesNotInclude`, `isNull`, `notNull`

For `inBetween`/`notInBetween`, provide two values: `values: [min, max]`.

## Comparisons

Comparisons work by **comparing row 1 to row 2** in the query results. This requires three things in the `metricQuery` that differ from a basic big number:

1. A **time dimension** in `dimensions` so the query produces one row per period
2. **Descending sort** on that dimension so the most recent period is row 1
3. **`limit: 2`** (or more) so a second row exists to compare against

```yaml
version: 1
name: "Monthly Revenue"
slug: "monthly-revenue"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions:
    - "orders_created_month"           # 1. Time dimension
  metrics:
    - "orders_total_revenue"
  filters: []
  sorts:
    - fieldId: "orders_created_month"
      descending: true                 # 2. Most recent first
  limit: 2                             # 3. Two rows for comparison

chartConfig:
  type: "big_number"
  config:
    selectedField: "orders_total_revenue"
    label: "Monthly Revenue"
    style: "M"
    showBigNumberLabel: true
    showComparison: true
    comparisonFormat: "percentage"
    comparisonLabel: "vs. Previous Month"
```

### Common Mistakes

- **`limit: 1` with comparison**: No second row exists, so the comparison silently disappears.
- **Ascending sort**: Row 1 becomes the oldest period — the big number shows stale data.
- **No time dimension**: The query returns a single aggregated row with nothing to compare.

## Quick Reference

### Number Styles

| Style | Example | Use Case |
|-------|---------|----------|
| `"K"` | 1,500 → 1.5K | Thousands |
| `"M"` | 1,500,000 → 1.5M | Millions |
| `"B"` | 1,500,000,000 → 1.5B | Billions |

### flipColors

| Value | Increase | Decrease | Use For |
|-------|----------|----------|---------|
| `false` (default) | Green | Red | Revenue, users, signups |
| `true` | Red | Green | Costs, errors, churn |
