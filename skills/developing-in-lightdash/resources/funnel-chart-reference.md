# Funnel Chart Reference

Funnel charts visualize stages in a sequential process, showing how values decrease from one stage to the next. Common use cases include conversion funnels, sales pipelines, and multi-step user flows.

## When to Use Funnel Charts

- **Conversion funnels**: Website visitors → signups → paid customers
- **Sales pipelines**: Leads → qualified → proposal → closed
- **Process flows**: Application stages, checkout flows, onboarding steps
- **Drop-off analysis**: Identify where users leave a process

## Chart Structure

### Basic Configuration

```yaml
version: 1
name: "Sales Funnel"
slug: sales-funnel
spaceSlug: sales
tableName: leads

metricQuery:
  exploreName: leads
  dimensions:
    - leads_stage
  metrics:
    - leads_count
  sorts:
    - fieldId: leads_stage
      descending: false

chartConfig:
  type: funnel
  config:
    fieldId: leads_count
    dataInput: row
```

### Configuration Options

#### `dataInput` (optional)

How the data is structured in your query results.

- `row` (default): Each row represents a funnel stage
- `column`: Each column represents a funnel stage

```yaml
config:
  dataInput: row    # Use when stages are in different rows
  # OR
  dataInput: column # Use when stages are in different columns
```

**Row-based example** (recommended):
```
| stage          | count |
|----------------|-------|
| Awareness      | 10000 |
| Interest       | 5000  |
| Consideration  | 2000  |
| Purchase       | 500   |
```

**Column-based example**:
```
| awareness | interest | consideration | purchase |
|-----------|----------|---------------|----------|
| 10000     | 5000     | 2000          | 500      |
```

#### `fieldId` (required)

The field ID (metric or dimension) to display as the funnel values.

```yaml
config:
  fieldId: leads_count  # Metric to show in funnel
```

## Label Configuration

### Label Position

Control where stage labels appear relative to the funnel segments.

```yaml
config:
  labels:
    position: inside    # inside, left, right, hidden
    showValue: true
    showPercentage: true
```

**Position options**:
- `inside`: Labels appear within funnel segments (default)
- `left`: Labels appear to the left of segments
- `right`: Labels appear to the right of segments
- `hidden`: No labels shown

### Label Content

```yaml
config:
  labels:
    showValue: true        # Show actual values (e.g., "5,000")
    showPercentage: true   # Show percentage of max (e.g., "50%")
```

**Label format examples**:
- Both true: `"Interest: 50% - 5,000"`
- Only percentage: `"Interest: 50%"`
- Only value: `"Interest: 5,000"`
- Both false: `"Interest"`

### Label Overrides

Provide custom labels for specific stages.

```yaml
config:
  labelOverrides:
    leads_stage_awareness: "Top of Funnel"
    leads_stage_interest: "Engaged Users"
    leads_stage_consideration: "Hot Leads"
    leads_stage_purchase: "Converted Customers"
```

## Styling Configuration

### Color Overrides

Customize colors for individual funnel stages.

```yaml
config:
  colorOverrides:
    leads_stage_awareness: "#3b82f6"      # Blue
    leads_stage_interest: "#10b981"       # Green
    leads_stage_consideration: "#f59e0b"  # Amber
    leads_stage_purchase: "#8b5cf6"       # Purple
```

### Metadata

Alternative way to set colors using metadata (less common in charts-as-code).

```yaml
config:
  metadata:
    leads_stage_awareness:
      color: "#3b82f6"
    leads_stage_interest:
      color: "#10b981"
```

## Legend Configuration

### Show/Hide Legend

```yaml
config:
  showLegend: true          # Show legend (default: true)
  legendPosition: vertical  # horizontal, vertical
```

**Legend position options**:
- `horizontal`: Legend appears at the top, centered
- `vertical`: Legend appears on the left side, vertically aligned

## Complete Examples

### Example 1: Basic Conversion Funnel

```yaml
version: 1
name: "Website Conversion Funnel"
slug: website-conversion-funnel
spaceSlug: marketing
tableName: events

metricQuery:
  exploreName: events
  dimensions:
    - events_stage
  metrics:
    - events_user_count
  sorts:
    - fieldId: events_stage
      descending: false
  limit: 10

chartConfig:
  type: funnel
  config:
    fieldId: events_user_count
    dataInput: row
    labels:
      position: inside
      showValue: true
      showPercentage: true
    showLegend: true
    legendPosition: horizontal
```

### Example 2: Custom Stage Colors and Labels

```yaml
version: 1
name: "Sales Pipeline"
slug: sales-pipeline
spaceSlug: sales
tableName: opportunities

metricQuery:
  exploreName: opportunities
  dimensions:
    - opportunities_stage
  metrics:
    - opportunities_count
  sorts:
    - fieldId: opportunities_stage
      descending: false
  limit: 10

chartConfig:
  type: funnel
  config:
    fieldId: opportunities_count
    dataInput: row

    # Custom stage labels
    labelOverrides:
      opportunities_stage_lead: "New Leads"
      opportunities_stage_qualified: "Qualified Opportunities"
      opportunities_stage_proposal: "Proposal Sent"
      opportunities_stage_negotiation: "In Negotiation"
      opportunities_stage_closed: "Closed Won"

    # Custom stage colors
    colorOverrides:
      opportunities_stage_lead: "#3b82f6"
      opportunities_stage_qualified: "#06b6d4"
      opportunities_stage_proposal: "#10b981"
      opportunities_stage_negotiation: "#f59e0b"
      opportunities_stage_closed: "#8b5cf6"

    labels:
      position: inside
      showValue: true
      showPercentage: true

    showLegend: true
    legendPosition: vertical
```

### Example 3: With Percentages Only (Clean Layout)

```yaml
version: 1
name: "Checkout Flow Drop-off"
slug: checkout-drop-off
spaceSlug: product
tableName: checkout_events

metricQuery:
  exploreName: checkout_events
  dimensions:
    - checkout_events_step
  metrics:
    - checkout_events_session_count
  sorts:
    - fieldId: checkout_events_step
      descending: false

chartConfig:
  type: funnel
  config:
    fieldId: checkout_events_session_count
    dataInput: row

    labelOverrides:
      checkout_events_step_cart: "Cart"
      checkout_events_step_shipping: "Shipping Info"
      checkout_events_step_payment: "Payment"
      checkout_events_step_confirmation: "Order Complete"

    labels:
      position: inside
      showValue: false        # Hide raw values for cleaner look
      showPercentage: true    # Show only percentages

    showLegend: false         # Hide legend to focus on funnel
```

### Example 4: Row vs Column Data Input

**Row-based (recommended)**:

```yaml
version: 1
name: "Funnel (Row Data)"
slug: funnel-row-data
spaceSlug: analytics
tableName: user_journey

metricQuery:
  exploreName: user_journey
  dimensions:
    - user_journey_stage  # Different stages in rows
  metrics:
    - user_journey_users
  sorts:
    - fieldId: user_journey_stage
      descending: false

chartConfig:
  type: funnel
  config:
    fieldId: user_journey_users
    dataInput: row    # Each row is a stage
```

**Column-based**:

```yaml
version: 1
name: "Funnel (Column Data)"
slug: funnel-column-data
spaceSlug: analytics
tableName: funnel_metrics

metricQuery:
  exploreName: funnel_metrics
  metrics:
    - funnel_stage_1_count
    - funnel_stage_2_count
    - funnel_stage_3_count
    - funnel_stage_4_count

chartConfig:
  type: funnel
  config:
    fieldId: null  # Not used for column-based
    dataInput: column  # Each metric/column is a stage
```

### Example 5: External Labels for Long Names

```yaml
version: 1
name: "Detailed Sales Stages"
slug: detailed-sales-stages
spaceSlug: sales
tableName: deals

metricQuery:
  exploreName: deals
  dimensions:
    - deals_detailed_stage
  metrics:
    - deals_opportunity_count
  sorts:
    - fieldId: deals_detailed_stage
      descending: false

chartConfig:
  type: funnel
  config:
    fieldId: deals_opportunity_count
    dataInput: row

    labelOverrides:
      deals_detailed_stage_1: "Initial Contact & Discovery"
      deals_detailed_stage_2: "Needs Analysis & Qualification"
      deals_detailed_stage_3: "Proposal & Presentation"
      deals_detailed_stage_4: "Contract Negotiation"
      deals_detailed_stage_5: "Closed Won"

    labels:
      position: right     # Labels outside for long text
      showValue: true
      showPercentage: true

    showLegend: false
```

## Best Practices

### Data Preparation

1. **Order stages logically**: Sort your query results in the correct funnel order (top to bottom)
2. **Use meaningful stage names**: Clear labels help users understand the process
3. **Include all stages**: Don't filter out stages with zero values - they show drop-off points

### Visual Design

1. **Limit stages**: 4-7 stages for optimal readability
2. **Show percentages**: Help viewers understand conversion rates between stages
3. **Use sequential colors**: Colors should suggest progression (e.g., blue → purple → green)
4. **Position labels appropriately**:
   - Use `inside` for short stage names and wide funnels
   - Use `left` or `right` for long stage names
   - Use `hidden` when legend provides sufficient context

### Color Guidelines

1. **Avoid using red/green for funnel stages**: These colors imply good/bad, which doesn't fit sequential processes
2. **Use color gradients**: Show progression with shades of the same color or a logical color sequence
3. **Maintain contrast**: Ensure labels are readable against segment colors
4. **Be consistent**: Use the same colors for the same stages across related charts

### When Not to Use Funnel Charts

- **Non-sequential processes**: Use pie or bar charts instead
- **Comparing multiple funnels**: Use grouped bar charts
- **Many stages (>7)**: Consider a line or bar chart
- **Stages can increase**: Funnels assume decreasing values

## Common Issues

### Issue: Stages appear in wrong order

**Solution**: Add a sort in your metric query:

```yaml
metricQuery:
  sorts:
    - fieldId: stage_field
      descending: false
```

### Issue: Labels are cut off or overlapping

**Solution**: Change label position:

```yaml
config:
  labels:
    position: right  # or left
```

### Issue: Colors don't show up

**Solution**: Ensure you're using valid hex color codes:

```yaml
config:
  colorOverrides:
    stage_1: "#3b82f6"  # Include # prefix
```

### Issue: Legend shows internal field IDs

**Solution**: Use label overrides:

```yaml
config:
  labelOverrides:
    internal_field_id: "User-Friendly Name"
```

## Schema Reference

Based on `chart-as-code-1.0.json`, the complete schema for funnel chart configuration:

```yaml
chartConfig:
  type: funnel  # ChartType.FUNNEL
  config:
    # Data structure
    dataInput: row | column  # How data is organized

    # Field selection
    fieldId: string  # Metric/dimension to display

    # Label customization
    labelOverrides:
      <fieldId>: string  # Custom label for stage

    # Color customization
    colorOverrides:
      <fieldId>: string  # Hex color for stage

    # Alternative color definition
    metadata:
      <fieldId>:
        color: string

    # Label display
    labels:
      position: inside | left | right | hidden
      showValue: boolean
      showPercentage: boolean

    # Legend
    showLegend: boolean
    legendPosition: horizontal | vertical
```
