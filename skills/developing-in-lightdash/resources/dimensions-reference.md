# Dimensions Reference

Dimensions are attributes used to segment and filter data. They describe the "who", "what", "where", and "when" of your data.

## Basic Configuration

```yaml
columns:
  - name: customer_id
    description: "Unique customer identifier"
    meta:
      dimension:
        type: string
        label: "Customer ID"
        description: "The unique identifier for each customer"
        hidden: false
```

## Dimension Types

| Type | Description | SQL Examples |
|------|-------------|--------------|
| `string` | Text values | VARCHAR, TEXT, CHAR |
| `number` | Numeric values | INT, FLOAT, DECIMAL |
| `boolean` | True/false values | BOOLEAN |
| `date` | Date only (no time) | DATE |
| `timestamp` | Date and time | TIMESTAMP, DATETIME |

## All Configuration Options

### Core Properties

```yaml
dimension:
  type: string          # Required: string, number, boolean, date, timestamp
  label: "Display Name" # Human-readable name
  description: "..."    # Detailed description
  hidden: false         # Hide from UI (default: false)
  sql: "${TABLE}.column_name"  # Custom SQL expression
```

### Formatting

```yaml
dimension:
  type: number
  round: 2              # Decimal places
  format: "usd"         # Format preset: usd, gbp, eur, percent, km, mi, id
  compact: "millions"   # Compact display: thousands, millions, billions, trillions
```

**Compact Options:**
- Numbers: `thousands` (K), `millions` (M), `billions` (B), `trillions` (T)
- Bytes: `kilobytes`, `megabytes`, `gigabytes`, `terabytes`, `petabytes`
- Binary: `kibibytes`, `mebibytes`, `gibibytes`, `tebibytes`, `pebibytes`

### Time Intervals

For `timestamp` and `date` types:

```yaml
dimension:
  type: timestamp
  time_intervals:       # Which intervals to generate
    - RAW               # Original value
    - YEAR
    - QUARTER
    - MONTH
    - WEEK
    - DAY
    - HOUR              # timestamp only
    - MINUTE            # timestamp only
    - SECOND            # timestamp only
```

**Disable time intervals:**
```yaml
dimension:
  type: timestamp
  time_intervals: "OFF"  # or false
```

**All available intervals:**

| Interval | Description | Example Output |
|----------|-------------|----------------|
| `RAW` | Original timestamp | 2024-01-15 14:30:00 |
| `YEAR` | Truncated to year | 2024-01-01 |
| `QUARTER` | Truncated to quarter | 2024-01-01 |
| `MONTH` | Truncated to month | 2024-01-01 |
| `WEEK` | Truncated to week | 2024-01-15 |
| `DAY` | Truncated to day | 2024-01-15 |
| `HOUR` | Truncated to hour | 2024-01-15 14:00:00 |
| `MINUTE` | Truncated to minute | 2024-01-15 14:30:00 |
| `SECOND` | Truncated to second | 2024-01-15 14:30:00 |
| `MILLISECOND` | Truncated to ms | 2024-01-15 14:30:00.000 |
| `YEAR_NUM` | Year as number | 2024 |
| `QUARTER_NUM` | Quarter as number | 1 |
| `MONTH_NUM` | Month as number | 1 |
| `WEEK_NUM` | Week as number | 3 |
| `DAY_OF_YEAR_NUM` | Day of year | 15 |
| `DAY_OF_MONTH_NUM` | Day of month | 15 |
| `DAY_OF_WEEK_INDEX` | Day of week (0-6) | 1 |
| `HOUR_OF_DAY_NUM` | Hour (0-23) | 14 |
| `MINUTE_OF_HOUR_NUM` | Minute (0-59) | 30 |
| `QUARTER_NAME` | Quarter name | Q1 |
| `MONTH_NAME` | Month name | January |
| `DAY_OF_WEEK_NAME` | Day name | Monday |

### Organization

```yaml
dimension:
  type: string
  group_label: "Customer Details"  # Group in sidebar
  groups:                          # Multiple groups
    - "Customer"
    - "Demographics"
```

### Colors

Map values to colors for consistent chart styling:

```yaml
dimension:
  type: string
  colors:
    "Active": "#22c55e"     # Green
    "Inactive": "#ef4444"   # Red
    "Pending": "#f59e0b"    # Yellow
```

### URLs

Add clickable links to dimension values:

```yaml
dimension:
  type: string
  urls:
    - label: "View in CRM"
      url: "https://crm.example.com/customers/${value}"
    - label: "Support Tickets"
      url: "https://support.example.com/customer/${value}/tickets"
```

**URL Variables:**
- `${value}` - The dimension value
- `${row.other_dimension}` - Value from another dimension in the same row

### Access Control

Restrict access based on user attributes:

```yaml
dimension:
  type: string
  required_attributes:
    department: "sales"           # Single value
    region:                       # Multiple values (OR)
      - "north"
      - "south"
```

### AI Hints

Guide AI query generation:

```yaml
dimension:
  type: string
  ai_hint: "Use this for customer segmentation by industry"
  # Or multiple hints:
  ai_hint:
    - "Primary customer identifier"
    - "Use for customer-level analysis"
```

### Tags

Categorize dimensions:

```yaml
dimension:
  type: string
  tags:
    - "customer"
    - "pii"
```

## Custom SQL Dimensions

Create calculated dimensions:

```yaml
columns:
  - name: full_name
    meta:
      dimension:
        type: string
        sql: "CONCAT(${TABLE}.first_name, ' ', ${TABLE}.last_name)"

  - name: age_group
    meta:
      dimension:
        type: string
        sql: |
          CASE
            WHEN ${TABLE}.age < 18 THEN 'Under 18'
            WHEN ${TABLE}.age < 35 THEN '18-34'
            WHEN ${TABLE}.age < 55 THEN '35-54'
            ELSE '55+'
          END
```

## Additional Dimensions

Create derived dimensions from a base dimension:

```yaml
columns:
  - name: email
    meta:
      dimension:
        type: string
      additional_dimensions:
        email_domain:
          type: string
          label: "Email Domain"
          sql: "SPLIT_PART(${TABLE}.email, '@', 2)"
        has_company_email:
          type: boolean
          label: "Has Company Email"
          sql: "NOT ${TABLE}.email LIKE '%gmail.com' AND NOT ${TABLE}.email LIKE '%yahoo.com'"
```

## Complete Example

```yaml
columns:
  - name: created_at
    description: "When the customer account was created"
    meta:
      dimension:
        type: timestamp
        label: "Account Created"
        description: "The timestamp when the customer first signed up"
        time_intervals:
          - DAY
          - WEEK
          - MONTH
          - QUARTER
          - YEAR
        group_label: "Dates"

  - name: status
    description: "Current account status"
    meta:
      dimension:
        type: string
        label: "Account Status"
        description: "Active, Inactive, or Churned"
        colors:
          "Active": "#22c55e"
          "Inactive": "#94a3b8"
          "Churned": "#ef4444"
        group_label: "Account Info"

  - name: lifetime_value
    description: "Total customer spend"
    meta:
      dimension:
        type: number
        label: "Lifetime Value"
        format: "usd"
        round: 2
        compact: "thousands"
        group_label: "Financial"
        urls:
          - label: "Revenue Details"
            url: "/customers/${row.customer_id}/revenue"
```

## Best Practices

1. **Choose the right type**: Use `timestamp` for datetime, `date` for date-only
2. **Set meaningful labels**: Use business-friendly names
3. **Add descriptions**: Help users understand what dimensions represent
4. **Configure time intervals**: Only include intervals users actually need
5. **Group related dimensions**: Use `group_label` for cleaner organization
6. **Use colors consistently**: Map status values to intuitive colors
7. **Add URLs where useful**: Link to external systems for context
8. **Use AI hints**: Help AI assistants understand dimension purpose
