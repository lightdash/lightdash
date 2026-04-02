# Gauge Chart Reference

## Overview

Gauge charts in Lightdash provide a visual representation of a single metric value against a defined range, making them ideal for:

- **KPI monitoring**: Display performance against targets (e.g., revenue vs. goal)
- **Progress indicators**: Show completion percentage (e.g., 75% of quarterly target)
- **Status visualization**: Use color-coded sections to indicate health (red/yellow/green zones)
- **Threshold tracking**: Visualize metrics relative to warning and critical thresholds

Gauge charts display a single numeric value on a semi-circular dial with optional colored sections to indicate different ranges or performance zones.

## Schema Reference

For full schema details, see [chart-as-code-1.0.json](schemas/chart-as-code-1.0.json) under `$defs/gaugeChart`.

## Key Configuration Properties

The gauge `config` object supports these key properties:

### Core Value Settings

- **`selectedField`**: Field ID for the gauge value (a metric from your `metricQuery`)
- **`min`**: Minimum value for the gauge scale (default: 0)
- **`max`**: Fixed maximum value for the gauge scale
- **`maxFieldId`**: Field ID to use as dynamic maximum (mutually exclusive with `max`)

### Display Settings

- **`showAxisLabels`**: Show min/max labels on the gauge axis
- **`customLabel`**: Custom label to display instead of the field name
- **`showPercentage`**: Display the value as a percentage of max
- **`customPercentageLabel`**: Custom label for percentage display

### Sections (Color Ranges)

- **`sections`**: Array of colored ranges indicating performance zones. Each section requires:
  - `min` / `minFieldId`: Start value (fixed or dynamic)
  - `max` / `maxFieldId`: End value (fixed or dynamic)
  - `color`: Hex color code (e.g., `"#DC2626"`)

## Examples

### Example 1: Gauge with Color-Coded Sections

Gauge with red/yellow/green performance zones:

```yaml
chartConfig:
  config:
    customLabel: "CSAT Score"
    max: 10
    min: 0
    sections:
      # Red zone: 0-5 (poor)
      - color: "#DC2626"
        max: 5
        min: 0
      # Yellow zone: 5-7 (fair)
      - color: "#FBBF24"
        max: 7
        min: 5
      # Green zone: 7-10 (excellent)
      - color: "#10B981"
        max: 10
        min: 7
    selectedField: "customer_metrics_csat_score"
    showAxisLabels: true
  type: "gauge"
contentType: chart
metricQuery:
  dimensions: []
  exploreName: "customer_metrics"
  filters: []
  limit: 1
  metrics:
    - "customer_metrics_csat_score"
  sorts: []
name: "Customer Satisfaction Score"
slug: "customer-satisfaction"
spaceSlug: "metrics"
tableName: "customer_metrics"
version: 1
```

### Example 2: Dynamic Max with Percentage Display

Progress gauge against a dynamic target:

```yaml
chartConfig:
  config:
    customPercentageLabel: "% Complete"
    maxFieldId: "project_metrics_total_tasks"
    min: 0
    sections:
      - color: "#EF4444"
        max: 50
        min: 0
      - color: "#F59E0B"
        max: 75
        min: 50
      - color: "#22C55E"
        max: 100
        min: 75
    selectedField: "project_metrics_tasks_completed"
    showAxisLabels: true
    showPercentage: true
  type: "gauge"
contentType: chart
metricQuery:
  dimensions: []
  exploreName: "project_metrics"
  filters: []
  limit: 1
  metrics:
    - "project_metrics_tasks_completed"
    - "project_metrics_total_tasks"
  sorts: []
name: "Project Completion"
slug: "project-completion"
spaceSlug: "projects"
tableName: "project_metrics"
version: 1
```

## Common Patterns

### KPI Dashboard Gauge

```yaml
config:
  customPercentageLabel: "of Target"
  maxFieldId: "kpi_target_value"
  sections:
    - color: "#DC2626"  # Red: below target
      max: 80
      min: 0
    - color: "#FBBF24"  # Yellow: approaching target
      max: 100
      min: 80
    - color: "#10B981"  # Green: exceeding target
      max: 120
      min: 100
  selectedField: "kpi_current_value"
  showPercentage: true
```

### Simple Progress Indicator

```yaml
config:
  maxFieldId: "total_count"
  selectedField: "completed_count"
  showAxisLabels: true
  showPercentage: true
```

## Tips

1. **Limit to 1 row**: Gauge charts display a single value, so use `limit: 1` in your `metricQuery`.

2. **Use aggregated metrics**: Gauges work best with aggregated values (totals, averages, counts).

3. **Color accessibility**: Use high-contrast colors for sections (e.g., standard red/yellow/green: `#DC2626`, `#FBBF24`, `#10B981`).

4. **Section coverage**: Ensure sections cover the full range from `min` to `max` for complete visual coverage.

5. **Dynamic vs. static max**: Use `maxFieldId` when your target changes (e.g., different monthly goals), use `max` for fixed scales.

6. **Percentage display**: Best for completion tracking where 100% represents a meaningful goal.
