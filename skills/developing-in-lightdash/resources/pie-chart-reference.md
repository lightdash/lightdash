# Pie Chart Reference

Comprehensive guide for configuring pie and donut charts in Lightdash charts-as-code.

## Overview

Pie charts display part-to-whole relationships by dividing a circle into slices proportional to each category's value. Donut charts are the same but with a hollow center, which can make them easier to read when comparing multiple charts.

### When to Use

**Best for:**
- Showing proportions of a whole (percentages that sum to 100%)
- Comparing 3-7 categories
- When exact values are less important than relative proportions
- Simple categorical breakdowns

**Avoid when:**
- Comparing many categories (>7 slices)
- Precise comparisons are needed (use bar chart instead)
- Showing changes over time (use line chart instead)
- Values don't represent parts of a whole

### Pie vs Donut

| Feature | Pie Chart | Donut Chart |
|---------|-----------|-------------|
| Visual | Solid circle | Ring with hole |
| Use case | Single metric focus | Better for comparisons |
| Center space | None | Can display total/summary |
| Readability | Good for few slices | Better for many slices |
| When to use | Traditional preference | Modern dashboards, multiple charts |

## Basic Structure

Every pie chart requires:
1. `groupFieldIds` - One or more dimension fields to slice by
2. `metricId` - The metric to measure
3. Chart type set to `pie`

```yaml
version: 1
name: "Revenue by Product Category"
slug: revenue-by-category
spaceSlug: sales
tableName: orders

metricQuery:
  exploreName: orders
  dimensions:
    - orders_product_category
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 10

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_product_category
    metricId: orders_total_revenue
```

## Configuration Options

### Core Settings

```yaml
chartConfig:
  type: pie
  config:
    # Required fields
    groupFieldIds:
      - orders_product_category        # Array of field IDs for slicing
    metricId: orders_total_revenue     # The metric to display

    # Pie vs Donut
    isDonut: false                     # true = donut chart with hollow center
```

### Value Labels

Control what information appears on each slice:

```yaml
config:
  # Label position
  valueLabel: inside                   # Options: hidden, inside, outside

  # What to show
  showValue: true                      # Show actual numeric values
  showPercentage: true                 # Show percentage of total
```

**Label Position Options:**
- `hidden` - No labels on slices (legend only)
- `inside` - Labels appear within each slice
- `outside` - Labels appear outside with connecting lines

**Example combinations:**
```yaml
# Show both value and percentage inside slices
valueLabel: inside
showValue: true
showPercentage: true
# Result: "Electronics\n$45,230 (32%)"

# Show only percentages outside
valueLabel: outside
showValue: false
showPercentage: true
# Result: "32%"

# No slice labels (use legend only)
valueLabel: hidden
```

### Legend Configuration

```yaml
config:
  # Legend visibility and position
  showLegend: true                     # Show/hide legend
  legendPosition: vertical             # Options: horizontal, vertical

  # Legend text wrapping
  legendMaxItemLength: 50              # Max characters before truncation
```

**Legend Position:**
- `horizontal` - Legend appears below chart, items flow left-to-right
- `vertical` - Legend appears to the right, items stack top-to-bottom

### Custom Labels

Override the default labels for specific slices:

```yaml
config:
  groupLabelOverrides:
    "NA": "North America"              # Key: original value, Value: display label
    "EU": "Europe"
    "APAC": "Asia Pacific"
```

**Use cases:**
- Expand abbreviations
- Add context to codes
- Translate technical names to business terms
- Add emojis or special characters

### Custom Colors

Override default colors for specific slices:

```yaml
config:
  groupColorOverrides:
    "Electronics": "#3b82f6"           # Blue
    "Furniture": "#10b981"             # Green
    "Office Supplies": "#f59e0b"       # Orange
    "Other": "#94a3b8"                 # Gray
```

**Color format:** Hex color codes (`#RRGGBB`)

**Best practices:**
- Use brand colors for key categories
- Use semantic colors (green = good, red = bad)
- Use muted colors for "Other" or less important slices
- Maintain sufficient contrast between adjacent slices

### Metadata Colors

Alternative way to set colors using metadata structure:

```yaml
config:
  metadata:
    orders_product_category:
      Electronics:
        color: "#3b82f6"
      Furniture:
        color: "#10b981"
```

**Note:** `groupColorOverrides` is simpler and recommended for most cases.

### Per-Slice Display Options

Override label settings for individual slices:

```yaml
config:
  groupValueOptionOverrides:
    "Other":                           # Hide labels for "Other" category
      valueLabel: hidden
    "Electronics":                     # Show value but not percentage
      showValue: true
      showPercentage: false
    "Furniture":                       # Show outside for largest slice
      valueLabel: outside
      showValue: true
      showPercentage: true
```

**Use cases:**
- Hide labels for very small slices
- Show detailed info only for key categories
- Position labels outside for largest slices to avoid overlap
- Simplify cluttered charts

### Custom Sort Order

Control the order slices appear (clockwise from top):

```yaml
config:
  groupSortOverrides:
    - "Electronics"                    # First slice (12 o'clock position)
    - "Furniture"
    - "Office Supplies"
    - "Other"                          # Last slice
```

**Default behavior:** Slices are ordered by the `metricQuery.sorts` configuration.

**Best practices:**
- Put largest slice at top (12 o'clock)
- Group related categories together
- Put "Other" or miscellaneous categories last
- Consider clockwise reading pattern (top → right → bottom → left)

## Complete Examples

### Basic Pie Chart

Simple revenue breakdown by category:

```yaml
version: 1
name: "Revenue by Category"
slug: revenue-by-category
spaceSlug: sales
tableName: orders
updatedAt: 2026-01-30T10:00:00Z

metricQuery:
  exploreName: orders
  dimensions:
    - orders_product_category
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 10

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_product_category
    metricId: orders_total_revenue
    isDonut: false
    valueLabel: inside
    showValue: true
    showPercentage: true
    showLegend: true
    legendPosition: vertical
```

### Donut Chart with Custom Colors

Modern donut chart with brand colors:

```yaml
version: 1
name: "Customer Segments"
slug: customer-segments
spaceSlug: marketing
tableName: customers
updatedAt: 2026-01-30T10:00:00Z

metricQuery:
  exploreName: customers
  dimensions:
    - customers_segment
  metrics:
    - customers_total_lifetime_value
  sorts:
    - fieldId: customers_total_lifetime_value
      descending: true
  limit: 5

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - customers_segment
    metricId: customers_total_lifetime_value

    # Donut style
    isDonut: true

    # Labels
    valueLabel: outside
    showValue: false
    showPercentage: true

    # Legend
    showLegend: true
    legendPosition: horizontal

    # Custom colors
    groupColorOverrides:
      "Enterprise": "#7c3aed"          # Purple
      "Mid-Market": "#3b82f6"          # Blue
      "SMB": "#10b981"                 # Green
      "Startup": "#f59e0b"             # Orange
      "Other": "#6b7280"               # Gray
```

### Advanced Configuration

Comprehensive example with all customization options:

```yaml
version: 1
name: "Regional Sales Performance"
slug: regional-sales
spaceSlug: sales
tableName: orders
updatedAt: 2026-01-30T10:00:00Z

metricQuery:
  exploreName: orders
  dimensions:
    - orders_region
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 8

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_region
    metricId: orders_total_revenue

    # Donut chart
    isDonut: true

    # Default label settings
    valueLabel: inside
    showValue: true
    showPercentage: true

    # Legend
    showLegend: true
    legendPosition: vertical
    legendMaxItemLength: 30

    # Custom labels for region codes
    groupLabelOverrides:
      "NA": "North America"
      "EMEA": "Europe, Middle East & Africa"
      "APAC": "Asia Pacific"
      "LATAM": "Latin America"

    # Brand colors for regions
    groupColorOverrides:
      "NA": "#3b82f6"                  # Blue
      "EMEA": "#10b981"                # Green
      "APAC": "#f59e0b"                # Orange
      "LATAM": "#ef4444"               # Red
      "Other": "#94a3b8"               # Gray

    # Custom display for specific slices
    groupValueOptionOverrides:
      "Other":                         # Hide "Other" labels
        valueLabel: hidden
      "NA":                            # Show NA outside (largest)
        valueLabel: outside
        showValue: true
        showPercentage: true

    # Custom sort order
    groupSortOverrides:
      - "NA"                           # Largest first
      - "EMEA"
      - "APAC"
      - "LATAM"
      - "Other"                        # Smallest last
```

### Multi-Dimension Grouping

Using multiple dimensions for nested grouping:

```yaml
version: 1
name: "Sales by Region and Channel"
slug: sales-region-channel
spaceSlug: sales
tableName: orders
updatedAt: 2026-01-30T10:00:00Z

metricQuery:
  exploreName: orders
  dimensions:
    - orders_region
    - orders_sales_channel
  metrics:
    - orders_total_revenue
  sorts:
    - fieldId: orders_total_revenue
      descending: true
  limit: 15

chartConfig:
  type: pie
  config:
    groupFieldIds:
      - orders_region                  # Primary grouping
      - orders_sales_channel           # Secondary grouping
    metricId: orders_total_revenue

    isDonut: true
    valueLabel: outside
    showValue: false
    showPercentage: true
    showLegend: true
    legendPosition: vertical
    legendMaxItemLength: 40
```

**Note:** When using multiple group fields, slices represent unique combinations (e.g., "North America - Online", "North America - Retail", "Europe - Online", etc.)

## Best Practices

### Data Preparation

1. **Limit categories**: 3-7 slices for best readability
   ```yaml
   metricQuery:
     limit: 7                          # Limit to top 7 categories
   ```

2. **Group small values**: Combine small slices into "Other"
   ```sql
   -- In your dbt model
   CASE
     WHEN category IN ('Electronics', 'Furniture', 'Office Supplies') THEN category
     ELSE 'Other'
   END AS category_grouped
   ```

3. **Sort by value**: Largest slice first
   ```yaml
   metricQuery:
     sorts:
       - fieldId: orders_total_revenue
         descending: true
   ```

### Visual Design

1. **Use donut for modern look**: Better for dashboards
   ```yaml
   config:
     isDonut: true
   ```

2. **Position largest slice at 12 o'clock**: Use `groupSortOverrides`

3. **Avoid too many labels**: Use `hidden` or selective `groupValueOptionOverrides` for small slices

4. **Show percentages**: More meaningful than raw values for pie charts
   ```yaml
   config:
     showValue: false
     showPercentage: true
   ```

5. **Use consistent colors**: Same category = same color across charts
   ```yaml
   config:
     groupColorOverrides:
       "Electronics": "#3b82f6"        # Use same blue everywhere
   ```

### Label Placement

**Use `inside` when:**
- Few slices (3-5)
- Slices are relatively large
- Space is limited

**Use `outside` when:**
- Many slices (6-7)
- Some slices are very small
- Labels are long
- Exact values are important

**Use `hidden` when:**
- More than 7 slices
- Using comprehensive legend
- Chart is part of dashboard with other context

### Color Selection

1. **Sequential palette**: For ordered categories (low → high)
   ```yaml
   groupColorOverrides:
     "Small": "#dbeafe"               # Light blue
     "Medium": "#3b82f6"              # Blue
     "Large": "#1e40af"               # Dark blue
   ```

2. **Categorical palette**: For unordered categories
   ```yaml
   groupColorOverrides:
     "Electronics": "#3b82f6"         # Blue
     "Furniture": "#10b981"           # Green
     "Supplies": "#f59e0b"            # Orange
   ```

3. **Semantic colors**: For meaningful categories
   ```yaml
   groupColorOverrides:
     "Profit": "#22c55e"              # Green
     "Break-even": "#eab308"          # Yellow
     "Loss": "#ef4444"                # Red
   ```

4. **Accessibility**: Ensure sufficient contrast
   - Avoid similar colors next to each other
   - Don't rely on color alone (use labels)
   - Test with color blindness simulators

## Common Patterns

### Top N with Other

Show top categories, group rest as "Other":

```yaml
# In dbt model
SELECT
  CASE
    WHEN rank <= 5 THEN category
    ELSE 'Other'
  END AS category,
  SUM(revenue) as revenue
FROM (
  SELECT
    category,
    RANK() OVER (ORDER BY SUM(revenue) DESC) as rank,
    revenue
  FROM orders
  GROUP BY 1
)
GROUP BY 1

# In chart
config:
  groupColorOverrides:
    "Other": "#94a3b8"                 # Gray for Other
  groupValueOptionOverrides:
    "Other":
      valueLabel: hidden               # Hide Other label
```

### Regional Comparison

Consistent colors across regional charts:

```yaml
# Define color scheme once, reuse across charts
config:
  groupColorOverrides:
    "North America": "#3b82f6"
    "Europe": "#10b981"
    "Asia Pacific": "#f59e0b"
    "Latin America": "#ef4444"
    "Middle East": "#8b5cf6"
    "Africa": "#ec4899"
```

### Status/Health Indicators

Use semantic colors:

```yaml
config:
  groupLabelOverrides:
    "active": "Active"
    "warning": "Needs Attention"
    "critical": "Critical"

  groupColorOverrides:
    "active": "#22c55e"                # Green
    "warning": "#f59e0b"               # Orange
    "critical": "#ef4444"              # Red

  groupSortOverrides:
    - "active"                         # Green first
    - "warning"
    - "critical"                       # Red last
```

## Troubleshooting

### Slices Too Small to Read

**Problem:** Many small slices with overlapping labels

**Solutions:**
```yaml
# Option 1: Hide labels for small slices
config:
  groupValueOptionOverrides:
    "Small Category":
      valueLabel: hidden

# Option 2: Use outside labels
config:
  valueLabel: outside

# Option 3: Limit categories in query
metricQuery:
  limit: 5
```

### Legend Items Truncated

**Problem:** Long category names cut off

**Solution:**
```yaml
config:
  legendMaxItemLength: 100             # Increase from default 50
  legendPosition: vertical             # More space than horizontal
```

### Colors Not Applying

**Problem:** Custom colors don't appear

**Checklist:**
1. Check spelling of category values (case-sensitive)
2. Verify hex color format (`#RRGGBB`)
3. Ensure keys match exact values from data
4. Check that values appear in query results

```yaml
# Debug: Check exact values
metricQuery:
  dimensions:
    - orders_category                  # Check actual values returned

config:
  groupColorOverrides:
    "Electronics": "#3b82f6"           # Must match exactly (case-sensitive)
```

### Percentages Don't Sum to 100%

**Problem:** Chart shows percentages that don't total 100%

**Explanation:** This is expected when:
- Using `limit` in query (excludes some data)
- Filtering reduces total
- Rounding differences

**Solution:** Add context in description or include "Other" category

## Schema Reference

Complete JSON schema definition:

```json
{
  "type": ["object", "null"],
  "description": "Configuration for pie and donut charts",
  "additionalProperties": false,
  "properties": {
    "groupFieldIds": {
      "type": "array",
      "description": "Field IDs used for grouping/slicing the pie",
      "items": {
        "type": "string"
      }
    },
    "metricId": {
      "type": "string",
      "description": "Field ID of the metric to display"
    },
    "isDonut": {
      "type": "boolean",
      "description": "Display as donut chart with hole in center"
    },
    "valueLabel": {
      "type": "string",
      "enum": ["hidden", "inside", "outside"],
      "description": "Position of value labels on slices"
    },
    "showValue": {
      "type": "boolean",
      "description": "Show the actual value on slices"
    },
    "showPercentage": {
      "type": "boolean",
      "description": "Show percentage on slices"
    },
    "groupLabelOverrides": {
      "type": "object",
      "description": "Custom labels for each group/slice",
      "additionalProperties": {
        "type": "string"
      }
    },
    "groupColorOverrides": {
      "type": "object",
      "description": "Custom colors for each group/slice",
      "additionalProperties": {
        "type": "string"
      }
    },
    "groupValueOptionOverrides": {
      "type": "object",
      "description": "Per-slice value display options",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "valueLabel": {
            "type": "string",
            "enum": ["hidden", "inside", "outside"]
          },
          "showValue": {
            "type": "boolean"
          },
          "showPercentage": {
            "type": "boolean"
          }
        }
      }
    },
    "groupSortOverrides": {
      "type": "array",
      "description": "Custom sort order for groups/slices",
      "items": {
        "type": "string"
      }
    },
    "showLegend": {
      "type": "boolean",
      "description": "Show the chart legend"
    },
    "legendPosition": {
      "type": "string",
      "enum": ["horizontal", "vertical"],
      "description": "Legend orientation"
    },
    "legendMaxItemLength": {
      "type": "number",
      "description": "Maximum character length for legend items"
    },
    "metadata": {
      "type": "object",
      "description": "Metadata for series (colors, etc.)",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "color": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

## Related Documentation

- [Chart Types Reference](chart-types-reference.md) - Overview of all chart types
- [Metrics Reference](metrics-reference.md) - Defining metrics for pie charts
- [Dimensions Reference](dimensions-reference.md) - Configuring grouping dimensions
- [Dashboard Reference](dashboard-reference.md) - Adding pie charts to dashboards
