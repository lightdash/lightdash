# Funnel Chart Reference

Funnel charts visualize stages in a sequential process, showing how values decrease from one stage to the next. Common use cases include conversion funnels, sales pipelines, and multi-step user flows.

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/funnelChart`.

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
    selectedField: leads_count
    dataInput: row
```

### Key Configuration Options

#### `dataInput`

How the data is structured in your query results.

- `row` (default): Each row represents a funnel stage
- `column`: Each column represents a funnel stage

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

#### `selectedField`

The field ID (metric or dimension) to display as the funnel values.

#### `labels`

Control label display:
- `position`: `inside` (default), `left`, `right`, or `hidden`
- `showValue`: Show actual values (e.g., "5,000")
- `showPercentage`: Show percentage of max (e.g., "50%")

#### `labelOverrides`

Provide custom labels for specific stages:

```yaml
config:
  labelOverrides:
    leads_stage_awareness: "Top of Funnel"
    leads_stage_interest: "Engaged Users"
```

#### `colorOverrides`

Customize colors for individual funnel stages:

```yaml
config:
  colorOverrides:
    leads_stage_awareness: "#3b82f6"
    leads_stage_interest: "#10b981"
```

#### Legend Options

- `showLegend`: Show or hide the legend (default: true)
- `legendPosition`: `horizontal` or `vertical`

## Complete Example

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
    selectedField: opportunities_count
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

## Best Practices

### Data Preparation

1. **Order stages logically**: Sort your query results in the correct funnel order (top to bottom)
2. **Use meaningful stage names**: Clear labels help users understand the process
3. **Include all stages**: Don't filter out stages with zero values - they show drop-off points

### Visual Design

1. **Limit stages**: 4-7 stages for optimal readability
2. **Show percentages**: Help viewers understand conversion rates between stages
3. **Use sequential colors**: Colors should suggest progression
4. **Position labels appropriately**:
   - Use `inside` for short stage names and wide funnels
   - Use `left` or `right` for long stage names
   - Use `hidden` when legend provides sufficient context

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

**Solution**: Change label position to `left` or `right`.

### Issue: Colors don't show up

**Solution**: Ensure you're using valid hex color codes with the `#` prefix.

### Issue: Legend shows internal field IDs

**Solution**: Use `labelOverrides` to provide user-friendly names.
