# Tables Reference

Tables (also called Explores) are the foundation of your Lightdash project. They define the data structure, joins, and available fields for analysis.

## Basic Configuration

```yaml
version: 2

models:
  - name: orders
    description: "Order transactions"
    meta:
      label: "Orders"
```

## Table Properties

### Core Properties

```yaml
models:
  - name: orders
    meta:
      label: "Orders"                    # Display name
      description: "All order records"   # Description (can also use model description)
      hidden: false                      # Hide from explore list
```

### SQL Configuration

```yaml
meta:
  sql_table: "analytics.orders"          # Override table reference
  sql_where: "is_deleted = false"        # Always-applied filter
  sql_filter: "status != 'test'"         # Alias for sql_where
```

### Field Organization

```yaml
meta:
  order_fields_by: "label"               # Sort fields by: "label" or "index"
  group_label: "Sales"                   # Group in sidebar
```

### Primary Key

```yaml
meta:
  primary_key: "order_id"                # Single column
  # OR
  primary_key:                           # Composite key
    - order_id
    - line_item_id
```

### Default Time Dimension

Set the default time dimension for time-series analysis:

```yaml
meta:
  default_time_dimension:
    field: created_at
    interval: MONTH                      # Default grouping interval
```

### Default Show Underlying Values

Set default drill-down fields for all metrics:

```yaml
meta:
  default_show_underlying_values:
    - order_id
    - customer_name
    - amount
    - created_at
```

### Field Groups

Define groups for organizing fields:

```yaml
meta:
  group_details:
    customer_info:
      label: "Customer Information"
      description: "Fields related to customer data"
    order_details:
      label: "Order Details"
      description: "Fields about the order itself"
```

### Field Sets

Create named sets of fields for quick selection:

```yaml
meta:
  sets:
    customer_summary:
      label: "Customer Summary"
      description: "Key customer fields"
      fields:
        - customer_id
        - customer_name
        - email
        - total_orders
    financial:
      label: "Financial"
      fields:
        - amount
        - total_revenue
        - average_order_value
```

### Spotlight Configuration

Control visibility in the AI-powered search:

```yaml
meta:
  spotlight:
    visibility: "show"                   # "show" or "hide"
    categories:
      - "Sales"
      - "Core Tables"
```

### Required Filters

Enforce mandatory filters on all queries:

```yaml
meta:
  required_filters:
    - is_deleted: false
    - status: ["active", "pending"]
  # OR use default_filters (alias)
  default_filters:
    - region: "US"
```

### Access Control

Restrict table access based on user attributes:

```yaml
meta:
  required_attributes:
    department: "sales"                  # Single value required
    region:                              # Any of these values
      - "north"
      - "south"
      - "east"
```

### AI Hints

Guide AI query generation:

```yaml
meta:
  ai_hint: "Primary orders table - use for revenue and order analysis"
  # OR multiple hints
  ai_hint:
    - "Contains all order transactions"
    - "Join to customers table for customer details"
    - "Use order_date for time-series analysis"
```

### Parameters

Define dynamic parameters:

```yaml
meta:
  parameters:
    start_date:
      type: date
      label: "Start Date"
      default: "2024-01-01"
    region:
      type: string
      label: "Region"
      allowed_values:
        - "US"
        - "EU"
        - "APAC"
```

## Joins Configuration

```yaml
meta:
  joins:
    - join: customers
      sql_on: "${orders.customer_id} = ${customers.customer_id}"
      type: left
      label: "Customer"
      relationship: many-to-one

    - join: products
      sql_on: "${orders.product_id} = ${products.product_id}"
      type: inner
      fields:
        - product_name
        - category
```

See [Joins Reference](./joins-reference.md) for complete join configuration.

## Model-Level Metrics

Define metrics independent of specific columns:

```yaml
meta:
  metrics:
    revenue_per_customer:
      type: number
      sql: "SUM(${TABLE}.amount) / NULLIF(COUNT(DISTINCT ${TABLE}.customer_id), 0)"
      label: "Revenue per Customer"
      format: "usd"
      round: 2

    conversion_rate:
      type: number
      sql: |
        COUNT(CASE WHEN ${TABLE}.status = 'completed' THEN 1 END)::float
        / NULLIF(COUNT(*), 0) * 100
      label: "Conversion Rate"
      round: 1
```

## Additional Explores

Create additional explores from the same model:

```yaml
meta:
  explores:
    completed_orders:
      label: "Completed Orders"
      description: "Only completed orders"
      group_label: "Sales"
      required_filters:
        - status: "completed"
      joins:
        - join: customers
          sql_on: "${completed_orders.customer_id} = ${customers.customer_id}"

    high_value_orders:
      label: "High Value Orders"
      required_filters:
        - amount: ">= 1000"
```

## Complete Example

```yaml
version: 2

models:
  - name: orders
    description: "All order transactions from the e-commerce platform"
    meta:
      label: "Orders"
      order_fields_by: "label"
      group_label: "Sales"
      primary_key: order_id

      default_time_dimension:
        field: created_at
        interval: DAY

      default_show_underlying_values:
        - order_id
        - customer_name
        - amount
        - status
        - created_at

      group_details:
        customer:
          label: "Customer Info"
        order:
          label: "Order Details"
        financial:
          label: "Financial"

      spotlight:
        visibility: "show"
        categories:
          - "Sales"
          - "Core"

      ai_hint:
        - "Main orders table for revenue analysis"
        - "Join to customers for customer-level metrics"
        - "Use created_at for time trends"

      sql_where: "is_test = false AND is_deleted = false"

      joins:
        - join: customers
          sql_on: "${orders.customer_id} = ${customers.customer_id}"
          type: left
          label: "Customer"
          relationship: many-to-one

        - join: products
          sql_on: "${orders.product_id} = ${products.product_id}"
          type: left
          label: "Product"

      metrics:
        revenue_per_customer:
          type: number
          sql: "SUM(${TABLE}.amount) / NULLIF(COUNT(DISTINCT ${TABLE}.customer_id), 0)"
          label: "Revenue per Customer"
          format: "usd"
          round: 2
          group_label: "Calculated"

        order_completion_rate:
          type: number
          sql: |
            COUNT(CASE WHEN ${TABLE}.status = 'completed' THEN 1 END)::float
            / NULLIF(COUNT(*), 0) * 100
          label: "Completion Rate"
          round: 1
          group_label: "Calculated"

      explores:
        completed_orders:
          label: "Completed Orders Only"
          description: "Pre-filtered to completed orders"
          required_filters:
            - status: "completed"

    columns:
      - name: order_id
        description: "Unique order identifier"
        meta:
          dimension:
            type: string
            label: "Order ID"
            group_label: "Order Details"
          metrics:
            order_count:
              type: count
              label: "Total Orders"

      - name: customer_id
        description: "Customer who placed the order"
        meta:
          dimension:
            type: string
            label: "Customer ID"
            group_label: "Customer Info"
            hidden: true
          metrics:
            unique_customers:
              type: count_distinct
              label: "Unique Customers"

      - name: amount
        description: "Order total in USD"
        meta:
          dimension:
            type: number
            label: "Order Amount"
            format: "usd"
            group_label: "Financial"
          metrics:
            total_revenue:
              type: sum
              label: "Total Revenue"
              format: "usd"
            average_order_value:
              type: average
              label: "Avg Order Value"
              format: "usd"
              round: 2

      - name: status
        description: "Order status"
        meta:
          dimension:
            type: string
            label: "Status"
            group_label: "Order Details"
            colors:
              "completed": "#22c55e"
              "pending": "#f59e0b"
              "cancelled": "#ef4444"

      - name: created_at
        description: "When the order was placed"
        meta:
          dimension:
            type: timestamp
            label: "Order Date"
            group_label: "Order Details"
            time_intervals:
              - DAY
              - WEEK
              - MONTH
              - QUARTER
              - YEAR
```

## Best Practices

1. **Set clear labels**: Use business-friendly names
2. **Add descriptions**: Document what the table contains
3. **Configure primary key**: Enables better query optimization
4. **Set default time dimension**: Improves time-series exploration
5. **Define default_show_underlying_values**: Better drill-down experience
6. **Organize with groups**: Use group_label and group_details
7. **Use sql_where for data filtering**: Exclude test/deleted records
8. **Configure joins carefully**: Choose correct join types and relationships
9. **Add AI hints**: Help AI assistants understand the table
10. **Create focused explores**: Pre-filtered views for common use cases
