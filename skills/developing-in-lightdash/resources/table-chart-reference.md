# Table Chart Reference

## Overview

Table visualizations display your query results in a tabular format with powerful configuration options for customization, conditional formatting, and data presentation. Tables support features like frozen columns, bar visualizations within cells, custom column names, and sophisticated conditional formatting rules.

## YAML Structure

```yaml
version: 1
name: "My Table Chart"
description: "Optional description"
slug: "my-table-chart"
spaceSlug: "my-space"
tableName: "my_explore"
updatedAt: "2024-01-30T12:00:00Z"

metricQuery:
  dimensions:
    - field_id_1
    - field_id_2
  metrics:
    - metric_id_1
    - metric_id_2

chartConfig:
  type: "table"
  config:
    # Display options
    showColumnCalculation: true
    showRowCalculation: false
    showTableNames: false
    hideRowNumbers: false
    showResultsTotal: true
    showSubtotals: false
    metricsAsRows: false

    # Column-specific configuration
    columns:
      field_id_1:
        visible: true
        name: "Custom Column Name"
        frozen: true
        displayStyle: "text"
      metric_id_1:
        visible: true
        displayStyle: "bar"
        color: "#4A90E2"

    # Conditional formatting
    conditionalFormattings:
      - target:
          fieldId: "metric_id_1"
        color: "#FF0000"
        rules:
          - id: "rule-1"
            operator: "greaterThan"
            values: [100]
        applyTo: "cell"
```

## Table Configuration Options

### Display Options

#### `showColumnCalculation`
- **Type**: `boolean`
- **Description**: Show column totals/calculations at the bottom of the table
- **Default**: Varies by configuration
- **Example**:
  ```yaml
  showColumnCalculation: true
  ```

#### `showRowCalculation`
- **Type**: `boolean`
- **Description**: Show row totals/calculations in an additional column
- **Default**: Varies by configuration
- **Example**:
  ```yaml
  showRowCalculation: false
  ```

#### `showTableNames`
- **Type**: `boolean`
- **Description**: Show table names in column headers (e.g., "users.name" vs "name")
- **Default**: Varies by configuration
- **Example**:
  ```yaml
  showTableNames: false
  ```

#### `hideRowNumbers`
- **Type**: `boolean`
- **Description**: Hide the row number column on the left
- **Default**: `false`
- **Example**:
  ```yaml
  hideRowNumbers: true
  ```

#### `showResultsTotal`
- **Type**: `boolean`
- **Description**: Show total count of results
- **Default**: Varies by configuration
- **Example**:
  ```yaml
  showResultsTotal: true
  ```

#### `showSubtotals`
- **Type**: `boolean`
- **Description**: Show subtotal rows for grouped data
- **Default**: Varies by configuration
- **Example**:
  ```yaml
  showSubtotals: true
  ```

#### `metricsAsRows`
- **Type**: `boolean`
- **Description**: Display metrics as rows instead of columns (pivoted view)
- **Default**: `false`
- **Example**:
  ```yaml
  metricsAsRows: true
  ```

### Column Configuration

The `columns` object allows per-column customization using the field ID as the key.

```yaml
columns:
  <fieldId>:
    visible: true
    name: "Custom Name"
    frozen: false
    displayStyle: "text"
    color: "#4A90E2"
```

#### `visible`
- **Type**: `boolean`
- **Description**: Whether the column is visible in the table
- **Example**:
  ```yaml
  columns:
    old_field:
      visible: false
  ```

#### `name`
- **Type**: `string`
- **Description**: Custom display name for the column (overrides default field name)
- **Example**:
  ```yaml
  columns:
    user_first_name:
      name: "First Name"
  ```

#### `frozen`
- **Type**: `boolean`
- **Description**: Freeze the column so it sticks to the left side when scrolling horizontally
- **Example**:
  ```yaml
  columns:
    customer_id:
      frozen: true
  ```

#### `displayStyle`
- **Type**: `string`
- **Enum**: `"text"` | `"bar"`
- **Description**: How to display the cell value
  - `"text"`: Standard text display
  - `"bar"`: Horizontal bar chart visualization
- **Example**:
  ```yaml
  columns:
    revenue:
      displayStyle: "bar"
      color: "#10B981"
  ```

#### `color`
- **Type**: `string` (hex color code)
- **Description**: Color for bar display style
- **Required when**: `displayStyle: "bar"`
- **Example**:
  ```yaml
  columns:
    sales:
      displayStyle: "bar"
      color: "#3B82F6"
  ```

## Conditional Formatting

Conditional formatting allows you to highlight cells based on their values using colors, gradients, and comparison rules.

### Basic Structure

```yaml
conditionalFormattings:
  - target:
      fieldId: "field_to_format"
    color: "#FF0000"  # or { start: "#FFFFFF", end: "#FF0000" }
    rules: []  # for single-color rules
    rule: {}   # for gradient range rules
    applyTo: "cell"  # or "text"
```

### Conditional Formatting Properties

#### `target`
- **Type**: `object`
- **Description**: Target field for the formatting rule
- **Properties**:
  - `fieldId` (string): Field ID to apply formatting to
- **Example**:
  ```yaml
  target:
    fieldId: "revenue"
  ```

#### `color`
- **Type**: `string` | `object`
- **Description**: Color for formatting
  - **Single color** (string): Hex color code (e.g., `"#FF0000"`)
  - **Gradient** (object): Start and end colors for range-based formatting
- **Example (single color)**:
  ```yaml
  color: "#EF4444"
  ```
- **Example (gradient)**:
  ```yaml
  color:
    start: "#FFFFFF"
    end: "#10B981"
  ```

#### `rules`
- **Type**: `array`
- **Description**: Array of conditional formatting rules for single-color formatting
- **Items**: See [Conditional Formatting Rules](#conditional-formatting-rules)
- **Example**:
  ```yaml
  rules:
    - id: "high-value"
      operator: "greaterThan"
      values: [1000]
  ```

#### `rule`
- **Type**: `object`
- **Description**: Rule for color range formatting (used with gradient colors)
- **Properties**:
  - `min`: Minimum value (number or `"auto"`)
  - `max`: Maximum value (number or `"auto"`)
- **Example**:
  ```yaml
  rule:
    min: 0
    max: 1000
  ```
  ```yaml
  rule:
    min: "auto"
    max: "auto"
  ```

#### `applyTo`
- **Type**: `string`
- **Enum**: `"cell"` | `"text"`
- **Description**: Where to apply the formatting
  - `"cell"`: Apply color to cell background
  - `"text"`: Apply color to text
- **Example**:
  ```yaml
  applyTo: "cell"
  ```

### Conditional Formatting Rules

Each rule in the `rules` array defines a condition for applying formatting.

```yaml
- id: "unique-rule-id"
  operator: "greaterThan"
  values: [100]
  compareTarget: null  # or { fieldId: "other_field" }
```

#### `id`
- **Type**: `string`
- **Description**: Unique identifier for the rule
- **Example**:
  ```yaml
  id: "rule-1"
  ```

#### `operator`
- **Type**: `string`
- **Description**: Comparison operator
- **Enum values**:
  - **Null checks**: `"isNull"`, `"notNull"`
  - **Equality**: `"equals"`, `"notEquals"`
  - **String operations**: `"startsWith"`, `"endsWith"`, `"include"`, `"doesNotInclude"`
  - **Numeric comparisons**: `"lessThan"`, `"lessThanOrEqual"`, `"greaterThan"`, `"greaterThanOrEqual"`
  - **Date operations**: `"inThePast"`, `"notInThePast"`, `"inTheNext"`, `"inTheCurrent"`, `"notInTheCurrent"`
  - **Range operations**: `"inBetween"`, `"notInBetween"`

#### `values`
- **Type**: `array`
- **Description**: Values to compare against
- **Example**:
  ```yaml
  values: [100, 500]  # for inBetween operator
  ```
  ```yaml
  values: ["urgent"]  # for string comparison
  ```

#### `compareTarget`
- **Type**: `object` | `null`
- **Description**: Target field to compare against (for field-to-field comparisons)
- **Properties**:
  - `fieldId` (string): Field ID to compare against
- **Example**:
  ```yaml
  compareTarget:
    fieldId: "budget"
  ```

## Practical Examples

### Basic Table

Simple table with all default settings:

```yaml
version: 1
name: "Sales Overview"
slug: "sales-overview"
spaceSlug: "sales"
tableName: "orders"
updatedAt: "2024-01-30T12:00:00Z"

metricQuery:
  dimensions:
    - orders_customer_name
    - orders_order_date
  metrics:
    - orders_total_revenue
    - orders_order_count

chartConfig:
  type: "table"
  config:
    showColumnCalculation: true
    hideRowNumbers: false
```

### Frozen Columns

Keep key columns visible while scrolling:

```yaml
chartConfig:
  type: "table"
  config:
    columns:
      orders_customer_name:
        frozen: true
        name: "Customer"
      orders_customer_id:
        frozen: true
        name: "ID"
      orders_total_revenue:
        name: "Revenue"
```

### Bar Visualization in Cells

Display metrics as horizontal bars:

```yaml
chartConfig:
  type: "table"
  config:
    columns:
      orders_total_revenue:
        name: "Revenue"
        displayStyle: "bar"
        color: "#10B981"
      orders_order_count:
        name: "Orders"
        displayStyle: "bar"
        color: "#3B82F6"
      orders_avg_order_value:
        name: "Avg Order"
        displayStyle: "bar"
        color: "#8B5CF6"
```

### Conditional Formatting with Rules

Highlight cells based on conditions:

```yaml
chartConfig:
  type: "table"
  config:
    conditionalFormattings:
      # Highlight high revenue in green
      - target:
          fieldId: "orders_total_revenue"
        color: "#10B981"
        rules:
          - id: "high-revenue"
            operator: "greaterThanOrEqual"
            values: [10000]
        applyTo: "cell"

      # Highlight low order count in red
      - target:
          fieldId: "orders_order_count"
        color: "#EF4444"
        rules:
          - id: "low-orders"
            operator: "lessThan"
            values: [5]
        applyTo: "cell"

      # Highlight status text
      - target:
          fieldId: "orders_status"
        color: "#F59E0B"
        rules:
          - id: "pending-status"
            operator: "equals"
            values: ["pending"]
        applyTo: "text"
```

### Color Gradients

Create smooth color transitions based on value ranges:

```yaml
chartConfig:
  type: "table"
  config:
    conditionalFormattings:
      # Auto-range gradient (white to green)
      - target:
          fieldId: "orders_total_revenue"
        color:
          start: "#FFFFFF"
          end: "#10B981"
        rule:
          min: "auto"
          max: "auto"
        applyTo: "cell"

      # Fixed range gradient (red to yellow to green)
      - target:
          fieldId: "orders_profit_margin"
        color:
          start: "#EF4444"
          end: "#10B981"
        rule:
          min: 0
          max: 100
        applyTo: "cell"
```

### Multiple Conditional Formatting Rules

Apply different colors for different conditions:

```yaml
chartConfig:
  type: "table"
  config:
    conditionalFormattings:
      # Revenue tiers
      - target:
          fieldId: "orders_total_revenue"
        color: "#10B981"
        rules:
          - id: "excellent"
            operator: "greaterThanOrEqual"
            values: [50000]
        applyTo: "cell"

      - target:
          fieldId: "orders_total_revenue"
        color: "#3B82F6"
        rules:
          - id: "good"
            operator: "inBetween"
            values: [20000, 50000]
        applyTo: "cell"

      - target:
          fieldId: "orders_total_revenue"
        color: "#F59E0B"
        rules:
          - id: "fair"
            operator: "inBetween"
            values: [10000, 20000]
        applyTo: "cell"

      - target:
          fieldId: "orders_total_revenue"
        color: "#EF4444"
        rules:
          - id: "poor"
            operator: "lessThan"
            values: [10000]
        applyTo: "cell"
```

### Field-to-Field Comparison

Compare values between fields:

```yaml
chartConfig:
  type: "table"
  config:
    conditionalFormattings:
      # Highlight when actual exceeds budget
      - target:
          fieldId: "orders_actual_spend"
        color: "#EF4444"
        rules:
          - id: "over-budget"
            operator: "greaterThan"
            values: []
            compareTarget:
              fieldId: "orders_budget"
        applyTo: "cell"

      # Highlight when actual is under budget
      - target:
          fieldId: "orders_actual_spend"
        color: "#10B981"
        rules:
          - id: "under-budget"
            operator: "lessThanOrEqual"
            values: []
            compareTarget:
              fieldId: "orders_budget"
        applyTo: "cell"
```

### Complex Example

Combining multiple features:

```yaml
version: 1
name: "Sales Performance Dashboard"
slug: "sales-performance"
spaceSlug: "sales/reports"
tableName: "orders"
updatedAt: "2024-01-30T12:00:00Z"

metricQuery:
  dimensions:
    - orders_region
    - orders_sales_rep
  metrics:
    - orders_total_revenue
    - orders_order_count
    - orders_avg_order_value
    - orders_target_revenue

chartConfig:
  type: "table"
  config:
    # Display settings
    showColumnCalculation: true
    showRowCalculation: false
    hideRowNumbers: false
    showResultsTotal: true

    # Column configuration
    columns:
      # Frozen identification columns
      orders_region:
        frozen: true
        name: "Region"
      orders_sales_rep:
        frozen: true
        name: "Sales Rep"

      # Bar visualization for revenue
      orders_total_revenue:
        name: "Total Revenue"
        displayStyle: "bar"
        color: "#10B981"

      # Standard display for count
      orders_order_count:
        name: "# Orders"

      # Bar visualization for average
      orders_avg_order_value:
        name: "Avg Order Value"
        displayStyle: "bar"
        color: "#3B82F6"

      # Hide target column but use it for comparison
      orders_target_revenue:
        visible: false

    # Conditional formatting
    conditionalFormattings:
      # Revenue gradient
      - target:
          fieldId: "orders_total_revenue"
        color:
          start: "#FEF3C7"
          end: "#10B981"
        rule:
          min: "auto"
          max: "auto"
        applyTo: "cell"

      # Highlight if revenue exceeds target
      - target:
          fieldId: "orders_total_revenue"
        color: "#DBEAFE"
        rules:
          - id: "exceeded-target"
            operator: "greaterThanOrEqual"
            values: []
            compareTarget:
              fieldId: "orders_target_revenue"
        applyTo: "cell"

      # Highlight low order counts
      - target:
          fieldId: "orders_order_count"
        color: "#FEE2E2"
        rules:
          - id: "low-volume"
            operator: "lessThan"
            values: [10]
        applyTo: "cell"
```

## Operator Reference

### Null Checks
- `isNull`: Value is null/empty
- `notNull`: Value is not null/empty

### Equality
- `equals`: Value equals the comparison value
- `notEquals`: Value does not equal the comparison value

### String Operations
- `startsWith`: String starts with the comparison value
- `endsWith`: String ends with the comparison value
- `include`: String contains the comparison value
- `doesNotInclude`: String does not contain the comparison value

### Numeric Comparisons
- `lessThan`: Value is less than comparison value
- `lessThanOrEqual`: Value is less than or equal to comparison value
- `greaterThan`: Value is greater than comparison value
- `greaterThanOrEqual`: Value is greater than or equal to comparison value

### Range Operations
- `inBetween`: Value is between two comparison values (inclusive)
- `notInBetween`: Value is not between two comparison values

### Date Operations
- `inThePast`: Date is in the past (relative to now)
- `notInThePast`: Date is not in the past
- `inTheNext`: Date is in the next N days/weeks/months
- `inTheCurrent`: Date is in the current day/week/month/year
- `notInTheCurrent`: Date is not in the current day/week/month/year

## Tips and Best Practices

1. **Use frozen columns for identifiers**: Keep key columns like IDs, names, or dates frozen for easier data navigation.

2. **Combine bar visualization with conditional formatting**: Use bar display for quick visual comparison and conditional formatting to highlight outliers.

3. **Use "auto" for gradient ranges**: When values can vary significantly, use `min: "auto"` and `max: "auto"` for gradient rules.

4. **Hide comparison columns**: When using field-to-field comparisons, consider hiding the target field with `visible: false`.

5. **Apply formatting to cell vs text**: Use `applyTo: "cell"` for background highlights and `applyTo: "text"` for text color changes.

6. **Layer formatting rules**: Apply multiple formatting rules to create sophisticated visualizations (e.g., gradient + threshold highlights).

7. **Custom column names**: Use the `name` property to make column headers more user-friendly than raw field IDs.

8. **Metrics as rows**: Use `metricsAsRows: true` for pivoted views when you have many metrics but few dimensions.
