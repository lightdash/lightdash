# Dashboard Reference

Dashboards combine multiple charts, KPIs, and content tiles into a cohesive view for analysis and monitoring.

## Dashboard Structure

```yaml
version: 1
name: "Sales Dashboard"
slug: sales-dashboard
spaceSlug: sales
description: "Overview of sales performance"

tiles: []        # Chart and content tiles
tabs: []         # Optional tabs for organization
filters:         # Dashboard-level filters
  dimensions: []
```

## Tile Types

### Saved Chart Tile

Display a chart from your project:

```yaml
tiles:
  - type: saved_chart
    x: 0              # Grid column (0-35)
    y: 0              # Grid row
    w: 12             # Width in grid units (max 36)
    h: 6              # Height in grid units
    properties:
      chartSlug: monthly-revenue
      title: "Monthly Revenue"      # Optional override
      hideTitle: false
```

### SQL Chart Tile

Display a SQL-based chart:

```yaml
tiles:
  - type: sql_chart
    x: 12
    y: 0
    w: 12
    h: 6
    properties:
      chartSlug: custom-sql-chart
      savedSqlUuid: "abc123-def456"
```

### Markdown Tile

Add text, notes, or instructions:

```yaml
tiles:
  - type: markdown
    x: 0
    y: 6
    w: 12
    h: 4
    properties:
      title: "Key Insights"
      content: |
        ## Q4 Performance Summary

        - Revenue up **15%** vs last quarter
        - New customer acquisition improved
        - Focus areas:
          1. Enterprise segment
          2. APAC expansion

        [View detailed report](/dashboards/q4-deep-dive)
```

### Loom Video Tile

Embed Loom videos:

```yaml
tiles:
  - type: loom
    x: 24
    y: 0
    w: 12
    h: 6
    properties:
      title: "Dashboard Walkthrough"
      url: "https://www.loom.com/share/abc123"
```

### Heading Tile

Add section headers:

```yaml
tiles:
  - type: heading
    x: 0
    y: 10
    w: 36
    h: 1
    properties:
      text: "Regional Breakdown"
```

## Grid Layout

**IMPORTANT: The dashboard uses a 36-column grid system.** To fill the full width of the dashboard, set `w: 36`. Many layouts incorrectly use smaller widths (like 24 or 30), leaving empty space on the right side of the dashboard.

- **x**: Column position (0-35)
- **y**: Row position (0+)
- **w**: Width in columns (1-36). **Use 36 for full-width tiles.**
- **h**: Height in rows (minimum 1)

### Width Quick Reference

| Layout | Width (w) | Tiles per row |
|--------|-----------|---------------|
| Full width | 36 | 1 |
| Half width | 18 | 2 |
| Third width | 12 | 3 |
| Quarter width | 9 | 4 |
| Sixth width | 6 | 6 |

**Note:** The default tile width in Lightdash is 15 columns, which is less than half the grid. When creating dashboards, always explicitly set widths to fill the available space.

### Common Layouts

**Full width (w: 36):**
```yaml
x: 0, y: 0, w: 36, h: 6
```

**Two columns (w: 18 each, total: 36):**
```yaml
# Left half
x: 0, y: 0, w: 18, h: 6
# Right half
x: 18, y: 0, w: 18, h: 6
```

**Three columns (w: 12 each, total: 36):**
```yaml
x: 0, y: 0, w: 12, h: 6
x: 12, y: 0, w: 12, h: 6
x: 24, y: 0, w: 12, h: 6
```

**Four columns/KPIs (w: 9 each, total: 36):**
```yaml
x: 0, y: 0, w: 9, h: 3
x: 9, y: 0, w: 9, h: 3
x: 18, y: 0, w: 9, h: 3
x: 27, y: 0, w: 9, h: 3
```

## Dashboard Tabs

Organize tiles into multiple views:

```yaml
tabs:
  - uuid: "overview-tab"
    name: "Overview"
    order: 0
  - uuid: "details-tab"
    name: "Details"
    order: 1
  - uuid: "trends-tab"
    name: "Trends"
    order: 2

tiles:
  # Overview tab tiles
  - type: saved_chart
    tabUuid: "overview-tab"
    x: 0
    y: 0
    w: 36
    h: 6
    properties:
      chartSlug: revenue-summary

  # Details tab tiles
  - type: saved_chart
    tabUuid: "details-tab"
    x: 0
    y: 0
    w: 36
    h: 10
    properties:
      chartSlug: detailed-breakdown
```

## Dashboard Filters

### Dimension Filters

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_created_at_month
        tableName: orders
      operator: inThePast
      values: [12]
      settings:
        unitOfTime: months
        completed: true
      label: "Date Range"
      required: false
      disabled: false
```

### Filter Operators

| Operator | Description | Example Values |
|----------|-------------|----------------|
| `equals` | Exact match | `["completed"]` |
| `notEquals` | Not equal | `["cancelled"]` |
| `isNull` | Is null | `[]` |
| `notNull` | Is not null | `[]` |
| `startsWith` | Starts with | `["US-"]` |
| `endsWith` | Ends with | `["-2024"]` |
| `include` | Contains | `["enterprise"]` |
| `doesNotInclude` | Does not contain | `["test"]` |
| `lessThan` | Less than | `[1000]` |
| `lessThanOrEqual` | Less than or equal | `[1000]` |
| `greaterThan` | Greater than | `[0]` |
| `greaterThanOrEqual` | Greater than or equal | `[100]` |
| `inThePast` | In the past N periods | `[30]` |
| `notInThePast` | Not in the past | `[30]` |
| `inTheNext` | In the next N periods | `[7]` |
| `inTheCurrent` | In current period | `[1]` |
| `notInTheCurrent` | Not in current | `[1]` |
| `inBetween` | Between two values | `["2024-01-01", "2024-12-31"]` |
| `notInBetween` | Not between | `[0, 100]` |

### Date Filter Settings

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_created_at
        tableName: orders
      operator: inThePast
      values: [30]
      settings:
        unitOfTime: days       # days, weeks, months, quarters, years
        completed: true        # Only completed periods
```

### Per-Tile Filter Targeting (tileTargets)

Use `tileTargets` when a single dashboard filter needs to apply to tiles from different explores, mapping the filter to the equivalent field in each explore. This is essential for dashboards that combine data from multiple explores.

**Key concept:** A single conceptual filter (e.g., "Time Period") can target different physical fields across different explores. The default `target` applies to tiles using that explore; use `tileTargets` keyed by tile slug to override for tiles using different explores.

#### Cross-Explore Filter Example

When your dashboard has tiles from multiple explores (e.g., orders and customers), map the filter to the equivalent field in each:

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_created_at    # Default: for tiles using orders explore
        tableName: orders
      operator: inThePast
      values: [30]
      settings:
        unitOfTime: days
        completed: false
      label: "Date Range"
      tileTargets:
        sales-by-region:              # Tile slug - uses orders explore (matches default)
          fieldId: orders_created_at
          tableName: orders
        customer-metrics:             # Tile slug - uses customers explore (different field!)
          fieldId: customers_signup_date
          tableName: customers
        revenue-summary:              # Tile slug - uses orders explore
          fieldId: orders_created_at
          tableName: orders
```

#### Excluding Tiles from a Filter

Set a tile target to `false` to exclude it from the filter entirely:

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_region
        tableName: orders
      operator: equals
      values: []
      label: "Region"
      tileTargets:
        company-overview: false       # This tile ignores the region filter
```

#### Empty tileTargets

When all tiles use the same explore, you can leave `tileTargets` empty - the filter will apply to all tiles that have the matching field:

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_created_at
        tableName: orders
      operator: inThePast
      values: [12]
      settings:
        unitOfTime: months
        completed: true
      label: "Time Period"
      tileTargets: {}                 # Applies to all tiles with orders_created_at
```

### Required Filters

Force users to select a value:

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_date
        tableName: orders
      operator: equals
      values: []
      required: true           # Must be set
      label: "Select Date"
```

### Single Value Filters

Restrict to single selection:

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_region
        tableName: orders
      operator: equals
      values: []
      singleValue: true        # Only one value allowed
```

## Complete Dashboard Example

```yaml
version: 1
name: "Executive Sales Dashboard"
slug: executive-sales-dashboard
spaceSlug: leadership
description: "High-level sales performance metrics for leadership team"

tabs:
  - uuid: "overview"
    name: "Overview"
    order: 0
  - uuid: "regional"
    name: "By Region"
    order: 1
  - uuid: "products"
    name: "By Product"
    order: 2

tiles:
  # Row 1: KPIs (Overview tab)
  - type: saved_chart
    tabUuid: "overview"
    x: 0
    y: 0
    w: 9
    h: 3
    properties:
      chartSlug: total-revenue-kpi
      title: "Total Revenue"

  - type: saved_chart
    tabUuid: "overview"
    x: 9
    y: 0
    w: 9
    h: 3
    properties:
      chartSlug: total-orders-kpi
      title: "Total Orders"

  - type: saved_chart
    tabUuid: "overview"
    x: 18
    y: 0
    w: 9
    h: 3
    properties:
      chartSlug: new-customers-kpi
      title: "New Customers"

  - type: saved_chart
    tabUuid: "overview"
    x: 27
    y: 0
    w: 9
    h: 3
    properties:
      chartSlug: avg-order-value-kpi
      title: "Avg Order Value"

  # Row 2: Main chart (Overview tab)
  - type: saved_chart
    tabUuid: "overview"
    x: 0
    y: 3
    w: 24
    h: 8
    properties:
      chartSlug: revenue-trend
      title: "Revenue Trend"

  # Row 2: Notes (Overview tab)
  - type: markdown
    tabUuid: "overview"
    x: 24
    y: 3
    w: 12
    h: 8
    properties:
      title: "Key Insights"
      content: |
        ## This Month

        - Revenue tracking **+12%** vs target
        - Strong growth in Enterprise segment
        - APAC expansion on track

        ## Actions

        1. Review underperforming regions
        2. Accelerate Q4 campaigns
        3. Monitor churn in SMB

  # Regional tab
  - type: heading
    tabUuid: "regional"
    x: 0
    y: 0
    w: 36
    h: 1
    properties:
      text: "Regional Performance"

  - type: saved_chart
    tabUuid: "regional"
    x: 0
    y: 1
    w: 18
    h: 8
    properties:
      chartSlug: revenue-by-region

  - type: saved_chart
    tabUuid: "regional"
    x: 18
    y: 1
    w: 18
    h: 8
    properties:
      chartSlug: regional-trend

  # Products tab
  - type: saved_chart
    tabUuid: "products"
    x: 0
    y: 0
    w: 36
    h: 6
    properties:
      chartSlug: revenue-by-product-category

  - type: saved_chart
    tabUuid: "products"
    x: 0
    y: 6
    w: 36
    h: 8
    properties:
      chartSlug: product-performance-table

filters:
  dimensions:
    - target:
        fieldId: orders_created_at
        tableName: orders
      operator: inThePast
      values: [12]
      settings:
        unitOfTime: months
        completed: false
      label: "Time Period"

    - target:
        fieldId: orders_region
        tableName: orders
      operator: equals
      values: []
      label: "Region"
      singleValue: false

    - target:
        fieldId: orders_segment
        tableName: orders
      operator: equals
      values: []
      label: "Customer Segment"
```

## Dashboard Best Practices

### Layout

1. **Start with KPIs**: Top row for key metrics
2. **Flow logically**: Overview → Details → Drill-downs
3. **Use consistent sizing**: Align to grid, avoid odd sizes
4. **Group related content**: Use tabs or visual separation
5. **Leave breathing room**: Don't cram everything in

### Content

1. **Tell a story**: Dashboard should answer key questions
2. **Limit charts**: 5-10 per view/tab
3. **Use markdown**: Explain context and insights
4. **Include videos**: Loom for walkthroughs
5. **Add headings**: Separate sections clearly

### Filters

1. **Provide useful defaults**: Start with meaningful data
2. **Limit filter count**: 3-5 primary filters
3. **Use appropriate operators**: Date ranges vs. exact matches
4. **Consider required filters**: When context is needed
5. **Target filters correctly**: Not all filters apply to all charts
6. **Use tileTargets for multi-explore dashboards**: When tiles come from different explores, use `tileTargets` to map the filter to the equivalent field in each explore

### Filter Troubleshooting

**Problem: Dashboard filter isn't applying to some tiles**

This usually happens when those tiles use a different explore than the filter's `target`. The filter only auto-applies to tiles with a matching `fieldId` and `tableName`.

**Solution:** Add `tileTargets` entries for tiles using different explores:

```yaml
filters:
  dimensions:
    - target:
        fieldId: orders_date        # Works for orders explore tiles
        tableName: orders
      tileTargets:
        customer-chart:             # This tile uses customers explore
          fieldId: customers_date   # Map to equivalent field
          tableName: customers
```

**Problem: Filter applies to a tile when it shouldn't**

**Solution:** Explicitly exclude the tile:

```yaml
tileTargets:
  summary-tile: false               # This tile ignores the filter
```

### Performance

1. **Optimize chart queries**: Appropriate limits and filters
2. **Avoid too many tiles**: More tiles = slower load
3. **Use tabs**: Split large dashboards
4. **Pre-filter data**: Remove unnecessary rows in models

### Maintenance

1. **Document purpose**: Clear descriptions
2. **Review regularly**: Remove stale content
3. **Test filters**: Ensure they work as expected
4. **Version control**: Use as-code for tracking changes
