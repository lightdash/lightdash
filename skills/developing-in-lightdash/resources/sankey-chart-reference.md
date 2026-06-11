# Sankey Chart Reference

Guide for configuring Sankey charts in Lightdash charts-as-code.

> **Schema Reference**: For the complete schema definition, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/SankeyChart`.

> **Beta**: Sankey charts are currently in Beta. Configuration options may evolve.

## Overview

Sankey charts visualize flows between nodes, where the width of each link is proportional to the metric value. Each row in your query represents a flow from a source node to a target node, with a metric weighting the flow's magnitude.

Multi-level flows happen naturally when a node value appears in both the source and target columns (for example, "Engagement" can be a target of "Start" and a source of "Conversion"). Cyclical flows are also supported — nodes that loop back through the diagram are rendered with step suffixes (e.g., `Conversion - Step 2`, `Conversion - Step 4`) so each instance gets its own column without collapsing the cycle.

### When to Use

**Best for:**
- Showing how values move from source to target across discrete stages (user journeys, budget flows, energy/material transfers, referral paths)
- Multi-level processes where intermediate categories both receive and send flow
- Highlighting where flow concentrates or splits between stages

**Avoid when:**
- You only have one stage of flow (use a bar chart)
- Stages are strictly sequential with no branching (use a `funnel` chart)
- You need precise comparison of magnitudes (use a bar chart)
- The number of distinct nodes makes labels unreadable (>~30 nodes)

## Data Model

Every Sankey chart needs **two dimensions** (source + target) and **one metric** (the weight) in the metric query. Each row in the result is one flow:

| source       | target        | weight |
|--------------|---------------|--------|
| Start        | Acquisition   | 1000   |
| Acquisition  | Engagement    | 600    |
| Engagement   | Conversion    | 500    |
| Conversion   | Retargeting   | 200    |
| Retargeting  | Conversion    | 100    |

No special dbt configuration or column naming is required. Any two dimensions and one numeric metric work — the chart figures out levels and ordering from the source/target relationships in the data.

## Basic Structure

Every Sankey chart requires:
1. `sourceFieldId` — dimension field ID for the origin node of each flow
2. `targetFieldId` — dimension field ID for the destination node of each flow
3. `metricFieldId` — metric field ID that weights each flow
4. Chart type set to `sankey`

```yaml
chartConfig:
  config:
    metricFieldId: sankey_demo_total_weight
    sourceFieldId: sankey_demo_source
    targetFieldId: sankey_demo_target
  type: sankey
contentType: chart
metricQuery:
  dimensions:
    - sankey_demo_source
    - sankey_demo_target
  exploreName: sankey_demo
  limit: 500
  metrics:
    - sankey_demo_total_weight
  sorts:
    - descending: true
      fieldId: sankey_demo_total_weight
name: "Marketing Funnel Flow"
slug: marketing-funnel-flow
spaceSlug: marketing
tableName: sankey_demo
version: 1
```

## Configuration Options

### Core Settings

| Property | Type | Description |
|----------|------|-------------|
| `sourceFieldId` | `string` | Field ID for the source node dimension (required) |
| `targetFieldId` | `string` | Field ID for the target node dimension (required) |
| `metricFieldId` | `string` | Field ID for the link value metric (required) |
| `nodeAlign` | `"left" \| "right" \| "justify"` | Node alignment within the diagram (default: `justify`) |
| `orient` | `"horizontal" \| "vertical"` | Diagram orientation (default: `horizontal`) |

### Node Alignment

| Value | Behavior (horizontal) | Behavior (vertical) |
|-------|----------------------|---------------------|
| `justify` | Spreads nodes evenly across the width | Spreads nodes evenly down the height |
| `left` | Pushes nodes to their earliest possible column | Pushes nodes to the top |
| `right` | Pushes nodes to their latest possible column | Pushes nodes to the bottom |

### Orientation

- `horizontal` (default) — flows read left-to-right, labels render on the right
- `vertical` — flows read top-to-bottom, labels render on the bottom

## Complete Example

Marketing funnel with cyclical retargeting flows, using the `sankey_demo` model:

```yaml
chartConfig:
  config:
    metricFieldId: sankey_demo_total_weight
    nodeAlign: justify
    orient: horizontal
    sourceFieldId: sankey_demo_source
    targetFieldId: sankey_demo_target
  type: sankey
contentType: chart
metricQuery:
  dimensions:
    - sankey_demo_source
    - sankey_demo_target
  exploreName: sankey_demo
  limit: 500
  metrics:
    - sankey_demo_total_weight
  sorts:
    - descending: true
      fieldId: sankey_demo_total_weight
name: "Marketing Funnel Flow"
slug: marketing-funnel-flow
spaceSlug: marketing
tableName: sankey_demo
version: 1
```

The `sankey_demo` rows include flows like `Retargeting → Conversion` and `Retargeting → Engagement`, which loop back to nodes that already appear earlier in the diagram. The chart renders these cyclical paths by giving repeated nodes step suffixes so each occurrence sits in its own column.

## Best Practices

### Data Preparation

1. **Aggregate at the right grain**: each `(source, target)` pair should appear once. If your raw data has multiple rows per pair, aggregate them in your model or with a sum metric.
2. **Sort by metric descending**: ensures the largest flows render at the top of each column, which most readers expect.
3. **Limit to meaningful flows**: very small flows produce thin, unreadable links. Filter or bucket low-weight flows in your dbt model (e.g., group as "Other") before charting.
4. **Use distinct source/target dimensions**: source and target are typically the same kind of value (e.g., both are "stage names") but they must be queried as two columns. If your data has them in one column, pivot in your model first.

### Visual Design

1. **Start horizontal**: most readers parse left-to-right flow more easily; switch to `vertical` only when horizontal labels overlap.
2. **Use `justify` alignment** for evenly distributed multi-stage flows; switch to `left` or `right` only when most nodes belong to one extreme.
3. **Keep node count moderate**: 10–30 distinct nodes works well; beyond that, labels start to overlap and the diagram gets noisy.
4. **Cycles are fine**: the chart handles them with step suffixes — don't strip self-loops or feedback edges from your data unless they're truly noise.

## Troubleshooting

### Chart is empty or shows "no data"

- Confirm the metric query returns rows with non-null source, target, and metric values.
- Make sure the metric value is positive — rows with `metricValue <= 0` are dropped.
- Verify both `sourceFieldId` and `targetFieldId` are listed in `metricQuery.dimensions`.

### Same node appears multiple times with " - Step N" suffix

This is expected. The node participates in a cyclical or multi-depth flow, so each depth-level instance is rendered in its own column. If you don't want this, restructure your data to remove the cycle (e.g., rename the looped-back instance to a different node).

### Links are too thin to read

- Increase the diagram size in the dashboard tile.
- Filter out small-weight flows in the metric query or model.
- Reduce the number of distinct nodes by bucketing rare values into "Other" in your model.

### Labels overlap

- Switch `orient` between `horizontal` and `vertical` — one usually fits better.
- Reduce label length by editing dimension labels in the model YAML.

## Technical Details

For implementation details on the BFS-based depth assignment and ECharts configuration:

- Frontend hook: [`useSankeyChartConfig.ts`](../../../packages/frontend/src/hooks/useSankeyChartConfig.ts) — config state and the BFS algorithm that places cyclical edges
- Visualization docs: [`packages/frontend/src/components/LightdashVisualization/CLAUDE.md`](../../../packages/frontend/src/components/LightdashVisualization/CLAUDE.md) — Sankey chart section covers the data model, BFS depth assignment, and ECharts options

## Related Documentation

- [Chart Types](../SKILL.md#chart-types) — Overview of all chart types
- [Funnel Chart Reference](funnel-chart-reference.md) — For strictly sequential conversion stages
- [Metrics Reference](metrics-reference.md)
- [Dimensions Reference](dimensions-reference.md)
