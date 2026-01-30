# Custom Visualizations Reference

Custom visualizations in Lightdash allow you to create advanced, bespoke charts using Vega-Lite specifications. This is an advanced feature for users who need visualization types not covered by Lightdash's built-in chart types.

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/customVis`.

## Overview

Custom visualizations integrate with Vega-Lite, a declarative grammar for creating interactive visualizations. Lightdash automatically provides your query results to the Vega-Lite specification, allowing you to define exactly how the data should be visualized.

**When to use custom visualizations:**
- You need a visualization type not available in Lightdash's built-in charts (bar, line, pie, table, etc.)
- You need fine-grained control over visual encoding
- You want to use advanced Vega-Lite features like layered charts, projections, or complex transformations

**Requirements:**
- Familiarity with Vega-Lite specifications (see [Vega-Lite documentation](https://vega.github.io/vega-lite/))
- Understanding of your data structure and field names

## Configuration

### chartConfig.type
Must be set to `"custom"` for custom visualizations.

### chartConfig.config.spec
Type: `object`

The complete Vega-Lite specification object. This object defines how your data will be visualized.

**Key properties:**
- `$schema`: (Required) Vega-Lite schema URL, typically `https://vega.github.io/schema/vega-lite/v5.json`
- `mark`: The visual mark type (bar, line, point, area, rect, etc.)
- `encoding`: Maps data fields to visual properties (x, y, color, size, etc.)
- `transform`: Data transformations (filter, calculate, aggregate, etc.)
- `layer`: For layered/composite charts
- `projection`: For geographic visualizations

## How Lightdash Provides Data

Lightdash automatically provides your query results to the Vega-Lite specification:

- Data is available as an array of objects under the `values` key
- Field names in your Vega-Lite spec must match the field names from your `metricQuery` (dimensions, metrics, and table calculations)
- Field names use the format `table_field` (e.g., `orders_status`, `orders_count`)

**You do NOT need to specify the `data` property in your spec** - Lightdash provides it automatically.

## Examples

### Basic Bar Chart

A simple bar chart showing order counts by status:

```yaml
chartConfig:
  type: custom
  config:
    spec:
      $schema: https://vega.github.io/schema/vega-lite/v5.json
      mark: bar
      encoding:
        x:
          field: orders_status
          type: nominal
          axis:
            labelColor: '#6e7079'
            tickColor: '#6e7079'
        y:
          field: orders_count
          type: quantitative
          axis:
            labelColor: '#6e7079'
            tickColor: '#6e7079'
```

### Heatmap

A heatmap showing aggregated values across two dimensions:

```yaml
chartConfig:
  type: custom
  config:
    spec:
      $schema: https://vega.github.io/schema/vega-lite/v5.json
      mark: rect
      encoding:
        x:
          field: orders_created_month
          type: ordinal
        y:
          field: products_category
          type: nominal
        color:
          field: orders_total_revenue
          type: quantitative
          aggregate: sum
          scale:
            scheme: blues
```

## Tips and Best Practices

1. **Start with templates**: Use Lightdash's UI template gallery when creating custom visualizations interactively, then export to YAML
2. **Field names**: Always reference fields using their full names (e.g., `orders_status`, not just `status`)
3. **Data types**: Match Vega-Lite data types to your field types:
   - `nominal`: Categorical data without order
   - `ordinal`: Categorical data with order
   - `quantitative`: Numeric data
   - `temporal`: Date/time data
4. **Styling**: Use consistent colors (e.g., `#6e7079` for axis labels) to match Lightdash's theme
5. **Testing**: Test your Vega-Lite spec in the [Vega-Lite editor](https://vega.github.io/editor/) before adding to charts-as-code
6. **Keep it simple**: Complex visualizations are harder to maintain - consider if a built-in chart type could work instead

## Further Resources

- [Vega-Lite Documentation](https://vega.github.io/vega-lite/)
- [Vega-Lite Examples Gallery](https://vega.github.io/vega-lite/examples/)
- [Vega-Lite Interactive Editor](https://vega.github.io/editor/)
