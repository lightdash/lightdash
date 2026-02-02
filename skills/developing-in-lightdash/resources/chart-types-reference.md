# Chart Types Reference

This document provides an overview of all chart types available in Lightdash charts-as-code.

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json).

## Chart Type Index

Each chart type has its own detailed reference document with configuration options, examples, and best practices.

| Type | Description | Reference |
|------|-------------|-----------|
| `cartesian` | Bar, line, area, scatter charts with X/Y axes | [Cartesian Chart Reference](./cartesian-chart-reference.md) |
| `pie` | Pie and donut charts for part-of-whole visualization | [Pie Chart Reference](./pie-chart-reference.md) |
| `table` | Data tables with column formatting and conditional styling | [Table Chart Reference](./table-chart-reference.md) |
| `big_number` | Single KPI display with optional comparison | [Big Number Reference](./big-number-chart-reference.md) |
| `funnel` | Conversion funnels for tracking stage progression | [Funnel Chart Reference](./funnel-chart-reference.md) |
| `gauge` | Gauge/dial visualizations for progress toward targets | [Gauge Chart Reference](./gauge-chart-reference.md) |
| `treemap` | Hierarchical treemaps for nested categorical data | [Treemap Chart Reference](./treemap-chart-reference.md) |
| `map` | Geographic visualizations with markers or regions | [Map Chart Reference](./map-chart-reference.md) |
| `custom` | Vega-Lite custom charts for advanced visualizations | [Custom Viz Reference](./custom-viz-reference.md) |

## Quick Chart Type Selection Guide

Use this table to choose the right chart type based on your data pattern:

| Data Pattern | Recommended Chart | Why |
|--------------|-------------------|-----|
| Trends over time | Line or area (`cartesian`) | Shows continuous change with time on X-axis |
| Category comparisons | Bar (`cartesian`) | Easy visual comparison between discrete categories |
| Part-of-whole relationships | `pie` or `treemap` | Shows proportions summing to 100% |
| Single KPI metric | `big_number` | Focuses attention on one important value |
| Conversion stages | `funnel` | Visualizes drop-off between sequential steps |
| Progress toward target | `gauge` | Shows current value relative to goal |
| Geographic data | `map` | Plots data points or regions on a map |
| Detailed records | `table` | Displays raw data with sorting and formatting |
| Advanced custom needs | `custom` | Full Vega-Lite spec for custom visualizations |

## Common Chart Configuration

All chart types share a common base structure:

```yaml
version: "1.0"
name: "Chart Name"
slug: unique-chart-slug
spaceSlug: target-space
chartType: <type>  # One of the types listed above
query:
  # Query configuration (explore, dimensions, metrics, filters)
config:
  # Type-specific visualization configuration
```

See individual chart reference files for type-specific `config` options.
