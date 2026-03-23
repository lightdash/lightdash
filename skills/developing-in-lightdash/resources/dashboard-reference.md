# Dashboard Reference

Dashboards combine multiple charts, KPIs, and content tiles into a cohesive view for analysis and monitoring.

## Dashboard Structure

```yaml
contentType: dashboard
config:          # Dashboard configuration (date zoom, etc.)
  isAddFilterDisabled: false
  isDateZoomDisabled: false
description: "Overview of sales performance"
filters:         # Dashboard-level filters
  dimensions: []
name: "Sales Dashboard"
slug: sales-dashboard
spaceSlug: sales
tabs: []         # Optional tabs for organization
tiles: []        # Chart and content tiles
version: 1
```

## Tile Types

### Saved Chart Tile

Display a chart from your project:

```yaml
tiles:
  - h: 6              # Height in grid units
    properties:
      chartSlug: monthly-revenue
      hideTitle: false
      title: "Monthly Revenue"      # Optional override — does NOT auto-update when chart is renamed
    type: saved_chart
    w: 12             # Width in grid units (max 36)
    x: 0              # Grid column (0-35)
    y: 0              # Grid row
```

**WARNING:** The `title` property is independent of the chart's own name. When you rename or repurpose a chart, you MUST also update the `title` in every dashboard tile that references it via `chartSlug`. Forgetting this leaves stale titles on the dashboard.

**Chart scoping:** Charts can be scoped to a dashboard (via `dashboardSlug` on the chart YAML) or live independently in a space. See [Chart Types](../SKILL.md#chart-types) for guidance.

### SQL Chart Tile

Display a SQL-based chart:

```yaml
tiles:
  - h: 6
    properties:
      chartSlug: custom-sql-chart
      savedSqlUuid: "abc123-def456"
    type: sql_chart
    w: 12
    x: 12
    y: 0
```

### Markdown Tile

Add text, notes, or instructions:

```yaml
tiles:
  - h: 4
    properties:
      content: |
        ## Q4 Performance Summary

        - Revenue up **15%** vs last quarter
        - New customer acquisition improved
        - Focus areas:
          1. Enterprise segment
          2. APAC expansion

        [View detailed report](/dashboards/q4-deep-dive)
      title: "Key Insights"
    type: markdown
    w: 12
    x: 0
    y: 6
```

### Loom Video Tile

Embed Loom videos:

```yaml
tiles:
  - h: 6
    properties:
      title: "Dashboard Walkthrough"
      url: "https://www.loom.com/share/abc123"
    type: loom
    w: 12
    x: 24
    y: 0
```

### Heading Tile

Add section headers:

```yaml
tiles:
  - h: 1
    properties:
      text: "Regional Breakdown"
    type: heading
    w: 36
    x: 0
    y: 10
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

**IMPORTANT:** Tab `uuid` values must be valid UUIDs (e.g., `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`), not friendly names. The linter will reject non-UUID values. Generate UUIDs with `python3 -c "import uuid; print(uuid.uuid4())"`.

```yaml
tabs:
  - name: "Overview"
    order: 0
    uuid: "b3f1a2c4-d5e6-4f78-9abc-def012345678"
  - name: "Details"
    order: 1
    uuid: "c4d2b3e5-f6a7-4089-bcde-f12345678901"
  - name: "Trends"
    order: 2
    uuid: "d5e3c4f6-a7b8-4190-cdef-234567890123"

tiles:
  # Overview tab tiles
  - h: 6
    properties:
      chartSlug: revenue-summary
    tabUuid: "b3f1a2c4-d5e6-4f78-9abc-def012345678"
    type: saved_chart
    w: 36
    x: 0
    y: 0

  # Details tab tiles
  - h: 10
    properties:
      chartSlug: detailed-breakdown
    tabUuid: "c4d2b3e5-f6a7-4089-bcde-f12345678901"
    type: saved_chart
    w: 36
    x: 0
    y: 0
```

## Dashboard Filters

### Dimension Filters

```yaml
filters:
  dimensions:
    - disabled: false
      label: "Date Range"
      operator: inThePast
      required: false
      settings:
        completed: true
        unitOfTime: months
      target:
        fieldId: orders_created_at_month
        tableName: orders
      values: [12]
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
    - operator: inThePast
      settings:
        completed: true        # Only completed periods
        unitOfTime: days       # days, weeks, months, quarters, years
      target:
        fieldId: orders_created_at
        tableName: orders
      values: [30]
```

### Per-Tile Filter Targeting (tileTargets)

Use `tileTargets` when a single dashboard filter needs to apply to tiles from different explores, mapping the filter to the equivalent field in each explore. This is essential for dashboards that combine data from multiple explores.

**Key concept:** A single conceptual filter (e.g., "Time Period") can target different physical fields across different explores. The default `target` applies to tiles using that explore; use `tileTargets` keyed by tile slug to override for tiles using different explores.

#### Cross-Explore Filter Example

When your dashboard has tiles from multiple explores (e.g., orders and customers), map the filter to the equivalent field in each:

```yaml
filters:
  dimensions:
    - label: "Date Range"
      operator: inThePast
      settings:
        completed: false
        unitOfTime: days
      target:
        fieldId: orders_created_at    # Default: for tiles using orders explore
        tableName: orders
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
      values: [30]
```

#### Excluding Tiles from a Filter

Set a tile target to `false` to exclude it from the filter entirely:

```yaml
filters:
  dimensions:
    - label: "Region"
      operator: equals
      target:
        fieldId: orders_region
        tableName: orders
      tileTargets:
        company-overview: false       # This tile ignores the region filter
      values: []
```

#### Empty tileTargets

When all tiles use the same explore, you can leave `tileTargets` empty - the filter will apply to all tiles that have the matching field:

```yaml
filters:
  dimensions:
    - label: "Time Period"
      operator: inThePast
      settings:
        completed: true
        unitOfTime: months
      target:
        fieldId: orders_created_at
        tableName: orders
      tileTargets: {}                 # Applies to all tiles with orders_created_at
      values: [12]
```

### Required Filters

Force users to select a value:

```yaml
filters:
  dimensions:
    - label: "Select Date"
      operator: equals
      required: true           # Must be set
      target:
        fieldId: orders_date
        tableName: orders
      values: []
```

### Single Value Filters

Restrict to single selection:

```yaml
filters:
  dimensions:
    - operator: equals
      singleValue: true        # Only one value allowed
      target:
        fieldId: orders_region
        tableName: orders
      values: []
```

## Dashboard Configuration

Control dashboard-level settings like date zoom behavior:

```yaml
config:
  dateZoomGranularities:
    - Day
    - Week
    - Month
    - Quarter
    - Year
  defaultDateZoomGranularity: Month
  isAddFilterDisabled: false
  isDateZoomDisabled: false
```

### Config Properties

| Property | Type | Description |
|----------|------|-------------|
| `isDateZoomDisabled` | boolean | Disable the date zoom feature entirely |
| `isAddFilterDisabled` | boolean | Disable the add filter button entirely |
| `dateZoomGranularities` | string[] | Available granularity options (e.g., `Day`, `Week`, `Month`, `Quarter`, `Year`, or custom like `fiscal_quarter`) |
| `defaultDateZoomGranularity` | string | The granularity selected by default when the dashboard loads |
| `pinnedParameters` | string[] | List of pinned parameter names |

When `config` is omitted, date zoom is enabled with all default granularities.

## Complete Dashboard Example

```yaml
contentType: dashboard
config:
  dateZoomGranularities:
    - Day
    - Week
    - Month
    - Quarter
    - Year
  defaultDateZoomGranularity: Month
  isAddFilterDisabled: false
  isDateZoomDisabled: false
description: "High-level sales performance metrics for leadership team"
filters:
  dimensions:
    - label: "Time Period"
      operator: inThePast
      settings:
        completed: false
        unitOfTime: months
      target:
        fieldId: orders_created_at
        tableName: orders
      values: [12]

    - label: "Region"
      operator: equals
      singleValue: false
      target:
        fieldId: orders_region
        tableName: orders
      values: []

    - label: "Customer Segment"
      operator: equals
      target:
        fieldId: orders_segment
        tableName: orders
      values: []

name: "Executive Sales Dashboard"
slug: executive-sales-dashboard
spaceSlug: leadership
tabs:
  - name: "Overview"
    order: 0
    uuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
  - name: "By Region"
    order: 1
    uuid: "f7a5e6b8-c9d0-4312-ef01-456789012345"
  - name: "By Product"
    order: 2
    uuid: "a8b6f7c9-d0e1-4423-f012-567890123456"

tiles:
  # Row 1: KPIs (Overview tab)
  - h: 3
    properties:
      chartSlug: total-revenue-kpi
      title: "Total Revenue"
    tabUuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
    type: saved_chart
    w: 9
    x: 0
    y: 0

  - h: 3
    properties:
      chartSlug: total-orders-kpi
      title: "Total Orders"
    tabUuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
    type: saved_chart
    w: 9
    x: 9
    y: 0

  - h: 3
    properties:
      chartSlug: new-customers-kpi
      title: "New Customers"
    tabUuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
    type: saved_chart
    w: 9
    x: 18
    y: 0

  - h: 3
    properties:
      chartSlug: avg-order-value-kpi
      title: "Avg Order Value"
    tabUuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
    type: saved_chart
    w: 9
    x: 27
    y: 0

  # Row 2: Main chart (Overview tab)
  - h: 8
    properties:
      chartSlug: revenue-trend
      title: "Revenue Trend"
    tabUuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
    type: saved_chart
    w: 24
    x: 0
    y: 3

  # Row 2: Notes (Overview tab)
  - h: 8
    properties:
      content: |
        ## This Month

        - Revenue tracking **+12%** vs target
        - Strong growth in Enterprise segment
        - APAC expansion on track

        ## Actions

        1. Review underperforming regions
        2. Accelerate Q4 campaigns
        3. Monitor churn in SMB
      title: "Key Insights"
    tabUuid: "e6f4d5a7-b8c9-4201-def0-345678901234"
    type: markdown
    w: 12
    x: 24
    y: 3

  # Regional tab
  - h: 1
    properties:
      text: "Regional Performance"
    tabUuid: "f7a5e6b8-c9d0-4312-ef01-456789012345"
    type: heading
    w: 36
    x: 0
    y: 0

  - h: 8
    properties:
      chartSlug: revenue-by-region
    tabUuid: "f7a5e6b8-c9d0-4312-ef01-456789012345"
    type: saved_chart
    w: 18
    x: 0
    y: 1

  - h: 8
    properties:
      chartSlug: regional-trend
    tabUuid: "f7a5e6b8-c9d0-4312-ef01-456789012345"
    type: saved_chart
    w: 18
    x: 18
    y: 1

  # Products tab
  - h: 6
    properties:
      chartSlug: revenue-by-product-category
    tabUuid: "a8b6f7c9-d0e1-4423-f012-567890123456"
    type: saved_chart
    w: 36
    x: 0
    y: 0

  - h: 8
    properties:
      chartSlug: product-performance-table
    tabUuid: "a8b6f7c9-d0e1-4423-f012-567890123456"
    type: saved_chart
    w: 36
    x: 0
    y: 6

version: 1
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
