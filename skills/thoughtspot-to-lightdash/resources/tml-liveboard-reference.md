# TML Liveboard Reference

A ThoughtSpot Liveboard (formerly Pinboard) is a dashboard containing multiple visualizations. Each visualization embeds an Answer (chart/query).

## TML Structure

```yaml
guid: <uuid>
liveboard:
  name: "Dashboard Name"
  description: "Optional description"

  # Visualizations - each is an embedded Answer
  visualizations:
    - id: Viz_1                          # Internal viz ID
      answer:
        name: "Chart Title"
        tables:
          - id: "Table or Worksheet Name"
            name: "Table or Worksheet Name"
        search_query: "[Column1] [Column2] [Measure1]"
        answer_columns:
          - name: Column1
          - name: Measure1
        table:                           # Table visualization config
          table_columns:
            - column_id: Column1
              headline_aggregation: COUNT_DISTINCT
          ordered_column_ids:
            - Column1
            - Measure1
        chart:                           # Chart visualization config
          type: COLUMN                   # Chart type enum
          chart_columns:
            - column_id: Column1
            - column_id: Measure1
          axis_configs:
            - x:
              - Column1
              "y":
              - Measure1
        display_mode: CHART_MODE         # CHART_MODE or TABLE_MODE
      viz_guid: <uuid>                   # Unique viz identifier

  # Dashboard-level filters
  filters:
    - column:
        - "Column Name"
      oper: EQ                           # Filter operator
      values:
        - "value1"
        - "value2"
      is_mandatory: false
      excluded_visualizations:           # Viz IDs where filter doesn't apply
        - Viz_3

  # Layout configuration
  layout:
    tabs:                                # Optional tabbed layout
      - name: "Tab 1"
        description: "Tab description"
        id: tab-id-1
        tiles:
          - visualization_id: Viz_1
            x: 0
            y: 0
            width: 12
            height: 6
    tiles:                               # Non-tabbed layout (if no tabs)
      - visualization_id: Viz_1
        x: 0
        y: 0
        width: 12
        height: 6

  # Note tiles (markdown/text content)
  # Embedded inside visualizations with note_tile field
```

## Key Fields

### `visualizations[].answer`

Each visualization contains a full Answer definition inline. The Answer has:
- `name` - the chart title
- `tables` - data sources referenced (Worksheets or Tables)
- `search_query` - ThoughtSpot search bar query (columns in brackets)
- `answer_columns` - columns in the result set
- `chart` - visualization configuration (type, axes, colors)
- `table` - table visualization configuration
- `display_mode` - `CHART_MODE` or `TABLE_MODE`

### `layout`

Grid-based layout where each tile has:
- `visualization_id` - references the `id` field in `visualizations[]`
- `x`, `y` - grid position
- `width`, `height` - grid size

**Note:** ThoughtSpot grid units differ from Lightdash. ThoughtSpot typically uses a smaller grid. Scale proportionally to Lightdash's 36-column grid.

### `filters`

Dashboard-level filters that apply across visualizations:
- `column` - list of column name path segments
- `oper` - comparison operator (EQ, NE, IN, CONTAINS, etc.)
- `values` - filter values
- `excluded_visualizations` - viz IDs excluded from this filter

## Translation to Lightdash Dashboard

```yaml
# Lightdash dashboard output
version: 1
name: "Dashboard Name"
slug: dashboard-name
spaceSlug: target-space
description: "Optional description"
updatedAt: "2026-03-04T00:00:00.000Z"
downloadedAt: "2026-03-04T00:00:00.000Z"

tiles:
  # Each visualization becomes a saved_chart tile
  - type: saved_chart
    x: 0           # Scale from ThoughtSpot grid
    y: 0
    w: 12          # Lightdash uses 36-column grid
    h: 6
    properties:
      chartSlug: chart-title-slugified
      title: "Chart Title"
      hideTitle: false

filters:
  dimensions:
    - id: filter-uuid
      target:
        fieldId: column_name
        tableName: model_name
      operator: equals
      values:
        - "value1"
        - "value2"
  metrics: []
  tableCalculations: []
```

### Grid Translation

ThoughtSpot tiles use variable grid sizes. To translate:
1. Find the max x+width across all tiles to determine ThoughtSpot grid width
2. Scale proportionally to Lightdash's 36-column grid
3. Heights can be kept similar (Lightdash uses similar row units)

Example scaling (if ThoughtSpot uses 24-column grid):
- ThoughtSpot `width: 12` → Lightdash `w: 18` (12/24 * 36)
- ThoughtSpot `x: 12` → Lightdash `x: 18` (12/24 * 36)
