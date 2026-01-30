# Gauge Chart Reference

## Overview

Gauge charts in Lightdash provide a visual representation of a single metric value against a defined range, making them ideal for:

- **KPI monitoring**: Display performance against targets (e.g., revenue vs. goal)
- **Progress indicators**: Show completion percentage (e.g., 75% of quarterly target)
- **Status visualization**: Use color-coded sections to indicate health (red/yellow/green zones)
- **Threshold tracking**: Visualize metrics relative to warning and critical thresholds

Gauge charts display a single numeric value on a semi-circular dial with optional colored sections to indicate different ranges or performance zones.

## Basic Structure

```yaml
version: 1
name: "My Gauge Chart"
slug: "my-gauge-chart"
spaceSlug: "analytics"
tableName: "my_explore"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "my_explore_current_value"
    - "my_explore_target_value"  # Optional: for dynamic max
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "gauge"
  config:
    gaugeChart:
      selectedField: "my_explore_current_value"
      min: 0
      max: 100
      showAxisLabels: true
```

## Configuration Options

### `gaugeChart` (object, optional)

The main configuration object for gauge chart settings. All properties are optional.

#### Core Value Settings

- **`selectedField`** (string): Field ID for the gauge value. This should be a metric from your `metricQuery`.

- **`min`** (number): Minimum value for the gauge scale. Default is typically 0.

- **`max`** (number): Maximum value for the gauge scale. Use this for a fixed maximum.

- **`maxFieldId`** (string): Field ID to use as the maximum value. Use this when the max should be dynamic based on query results (e.g., a target metric). Mutually exclusive with `max`.

#### Display Settings

- **`showAxisLabels`** (boolean): Whether to show min/max labels on the gauge axis. Default is typically `true`.

- **`customLabel`** (string): Custom label to display with the gauge value instead of the field name.

- **`showPercentage`** (boolean): Display the value as a percentage of the max value.

- **`customPercentageLabel`** (string): Custom label for the percentage display when `showPercentage` is `true`.

#### Sections (Color Ranges)

- **`sections`** (array): Define colored sections/ranges on the gauge to indicate different performance zones. Each section is a `gaugeSection` object (see below).

### `gaugeSection` (object)

Defines a colored range on the gauge. Required properties: `min`, `max`, `color`.

- **`min`** (number, required): Start value for this section.

- **`max`** (number, required): End value for this section.

- **`minFieldId`** (string, optional): Field ID to use as the section's min value (dynamic min).

- **`maxFieldId`** (string, optional): Field ID to use as the section's max value (dynamic max).

- **`color`** (string, required): Color for this section as a hex code (e.g., `"#FF0000"` for red).

## Examples

### Example 1: Basic Gauge with Fixed Range

Simple gauge showing current revenue vs. a fixed target:

```yaml
version: 1
name: "Monthly Revenue"
slug: "monthly-revenue"
spaceSlug: "sales"
tableName: "sales_metrics"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "sales_metrics_current_revenue"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "gauge"
  config:
    gaugeChart:
      selectedField: "sales_metrics_current_revenue"
      min: 0
      max: 100000
      showAxisLabels: true
      customLabel: "Current Revenue ($)"
```

### Example 2: Multiple Colored Sections (Red/Yellow/Green Zones)

Gauge with color-coded performance zones:

```yaml
version: 1
name: "Customer Satisfaction Score"
slug: "customer-satisfaction"
spaceSlug: "metrics"
tableName: "customer_metrics"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "customer_metrics_csat_score"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "gauge"
  config:
    gaugeChart:
      selectedField: "customer_metrics_csat_score"
      min: 0
      max: 10
      showAxisLabels: true
      customLabel: "CSAT Score"
      sections:
        # Red zone: 0-5 (poor)
        - min: 0
          max: 5
          color: "#DC2626"
        # Yellow zone: 5-7 (fair)
        - min: 5
          max: 7
          color: "#FBBF24"
        # Green zone: 7-10 (excellent)
        - min: 7
          max: 10
          color: "#10B981"
```

### Example 3: Dynamic Max from Field

Gauge showing progress against a dynamic target value:

```yaml
version: 1
name: "Sales Progress vs Target"
slug: "sales-progress"
spaceSlug: "sales"
tableName: "sales_metrics"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "sales_metrics_current_sales"
    - "sales_metrics_quarterly_target"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "gauge"
  config:
    gaugeChart:
      selectedField: "sales_metrics_current_sales"
      min: 0
      maxFieldId: "sales_metrics_quarterly_target"  # Dynamic max
      showAxisLabels: true
      customLabel: "Current Sales"
```

### Example 4: Percentage Display with Custom Label

Display value as percentage with a custom label:

```yaml
version: 1
name: "Project Completion"
slug: "project-completion"
spaceSlug: "projects"
tableName: "project_metrics"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "project_metrics_tasks_completed"
    - "project_metrics_total_tasks"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "gauge"
  config:
    gaugeChart:
      selectedField: "project_metrics_tasks_completed"
      min: 0
      maxFieldId: "project_metrics_total_tasks"
      showAxisLabels: true
      showPercentage: true
      customPercentageLabel: "% Complete"
      sections:
        - min: 0
          max: 50
          color: "#EF4444"
        - min: 50
          max: 75
          color: "#F59E0B"
        - min: 75
          max: 100
          color: "#22C55E"
```

### Example 5: Advanced with Dynamic Sections

Dynamic sections using field values for boundaries:

```yaml
version: 1
name: "Performance Score"
slug: "performance-score"
spaceSlug: "analytics"
tableName: "performance_metrics"
updatedAt: "2024-01-01T00:00:00.000Z"

metricQuery:
  dimensions: []
  metrics:
    - "performance_metrics_current_score"
    - "performance_metrics_warning_threshold"
    - "performance_metrics_critical_threshold"
    - "performance_metrics_max_score"
  filters: []
  sorts: []
  limit: 1

chartConfig:
  type: "gauge"
  config:
    gaugeChart:
      selectedField: "performance_metrics_current_score"
      min: 0
      maxFieldId: "performance_metrics_max_score"
      showAxisLabels: true
      customLabel: "Performance"
      sections:
        # Critical zone: 0 to critical_threshold
        - min: 0
          maxFieldId: "performance_metrics_critical_threshold"
          color: "#DC2626"
        # Warning zone: critical_threshold to warning_threshold
        - minFieldId: "performance_metrics_critical_threshold"
          maxFieldId: "performance_metrics_warning_threshold"
          color: "#F59E0B"
        # Healthy zone: warning_threshold to max
        - minFieldId: "performance_metrics_warning_threshold"
          maxFieldId: "performance_metrics_max_score"
          color: "#10B981"
```

## Common Patterns

### KPI Dashboard Gauge

For executive dashboards showing current performance vs. target:

```yaml
gaugeChart:
  selectedField: "kpi_current_value"
  maxFieldId: "kpi_target_value"
  showPercentage: true
  customPercentageLabel: "of Target"
  sections:
    - min: 0
      max: 80
      color: "#DC2626"  # Red: below target
    - min: 80
      max: 100
      color: "#FBBF24"  # Yellow: approaching target
    - min: 100
      max: 120
      color: "#10B981"  # Green: exceeding target
```

### Simple Progress Indicator

For tracking completion without color zones:

```yaml
gaugeChart:
  selectedField: "completed_count"
  maxFieldId: "total_count"
  showPercentage: true
  showAxisLabels: true
```

### Health Status Gauge

For monitoring system health with thresholds:

```yaml
gaugeChart:
  selectedField: "health_score"
  min: 0
  max: 100
  showAxisLabels: true
  sections:
    - min: 0
      max: 50
      color: "#DC2626"  # Critical
    - min: 50
      max: 80
      color: "#FBBF24"  # Warning
    - min: 80
      max: 100
      color: "#10B981"  # Healthy
```

## Tips

1. **Limit to 1 row**: Gauge charts display a single value, so use `limit: 1` in your `metricQuery`.

2. **Use aggregated metrics**: Gauges work best with aggregated values (totals, averages, counts).

3. **Color accessibility**: Use high-contrast colors for sections (e.g., standard red/yellow/green: `#DC2626`, `#FBBF24`, `#10B981`).

4. **Section coverage**: Ensure sections cover the full range from `min` to `max` for complete visual coverage.

5. **Dynamic vs. static max**: Use `maxFieldId` when your target changes (e.g., different monthly goals), use `max` for fixed scales.

6. **Percentage display**: Best for completion tracking where 100% represents a meaningful goal.
