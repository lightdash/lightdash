# TML Liveboard Reference

A ThoughtSpot Liveboard (formerly Pinboard) is a dashboard containing multiple visualizations. Each visualization embeds an Answer (chart/query).

## TML Structure

> **Note:** ThoughtSpot TML exports historically use `pinboard:` as the top-level key (even after the product rename to "Liveboard"). Some newer ThoughtSpot Cloud versions may export with `liveboard:` instead. The structure is identical. Handle both by checking for either key.

```yaml
guid: <uuid>
pinboard:                                 # Or `liveboard:` in newer exports
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
          - id: Column1
            name: Column1
          - id: Measure1
            name: Measure1
        table:                           # Table visualization config
          table_columns:
            - column_id: Column1
              show_headline: true
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
                - column_id: Column1
              "y":
                - column_id: Measure1
          locked: false
          client_state: "<json_string>"  # Optional
        display_mode: CHART_MODE         # CHART_MODE or TABLE_MODE
      viz_guid: <uuid>                   # Unique viz identifier

    # Headline visualization (KPI / single number)
    - id: Viz_2
      answer:
        name: "Total Revenue"
        tables:
          - name: "Worksheet Name"
        search_query: "[Revenue]"
        answer_columns:
          - name: Total Revenue
        # Note: no `chart` section for headlines
      display_headline_column: "Total Revenue"    # This makes it a headline
      viz_guid: <uuid>

  # Dashboard-level filters (use lowercase symbol operators)
  filters:
    - column:
        - "Column Name"
      oper: "in"                         # in, not in, between, =<, !=, <=, >=, >, <
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
        tiles:
          - visualization_id: Viz_1
            x: 0
            y: 0
            width: 12
            height: 6
            size: MEDIUM                 # Optional: EXTRA_SMALL, SMALL, MEDIUM, LARGE, LARGE_SMALL, MEDIUM_SMALL, EXTRA_LARGE
    tiles:                               # Non-tabbed layout (if no tabs)
      - visualization_id: Viz_1
        x: 0
        y: 0
        width: 12
        height: 6
        size: MEDIUM                     # Optional

  # Parameter overrides
  parameter_overrides:
    - key: <parameter_guid>
      value:
        name: "Parameter Name"
        id: <parameter_guid>
        override_value: "custom_value"
```

## Key Fields

### `visualizations[].answer`

Each visualization contains a full Answer definition inline. The Answer has:
- `name` - the chart title
- `tables` - data sources referenced (Worksheets or Tables)
- `search_query` - ThoughtSpot search bar query (columns in brackets)
- `answer_columns` - columns in the result set (each with `id` and `name`)
- `chart` - visualization configuration (type, axes, colors) — absent for headline visualizations
- `table` - table visualization configuration
- `display_mode` - `CHART_MODE` or `TABLE_MODE`

### `visualizations[].display_headline_column`

When present, this marks the visualization as a headline/KPI tile. The value is the column name to display as a single number. When this field is set, there is typically no `chart` section. Translate to Lightdash `big_number` chart type.

### `layout`

Grid-based layout where each tile has:
- `visualization_id` - references the `id` field in `visualizations[]`
- `x`, `y` - grid position
- `width`, `height` - grid size
- `size` - optional preset size (`EXTRA_SMALL`, `SMALL`, `MEDIUM`, `LARGE`, `LARGE_SMALL`, `MEDIUM_SMALL`, `EXTRA_LARGE`)

**Note:** ThoughtSpot grid units differ from Lightdash. ThoughtSpot typically uses a smaller grid. Scale proportionally to Lightdash's 36-column grid.

### `filters`

Dashboard-level filters that apply across visualizations:
- `column` - list of column name path segments (primary filter column listed first for linked filters)
- `oper` - comparison operator in lowercase symbol form (`in`, `not in`, `between`, `=<`, `!=`, `<=`, `>=`, `>`, `<`)
- `values` - filter values
- `is_mandatory` - whether filter is required → maps to Lightdash `required: true`
- `excluded_visualizations` - viz IDs excluded from this filter → maps to Lightdash `tileTargets` with `false` for excluded tile slugs

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

tabs: []                     # Array of {uuid, name, order} objects, or empty

tiles:
  # Each visualization becomes a saved_chart tile
  - type: saved_chart
    uuid: null               # Set to null for new tiles
    tileSlug: null            # Optional tile slug
    x: 0                     # Scale from ThoughtSpot grid
    y: 0
    w: 12                    # Lightdash uses 36-column grid
    h: 6
    properties:
      chartSlug: chart-title-slugified
      title: "Chart Title"
      hideTitle: false

  # Note/text tiles use markdown type
  - type: markdown
    uuid: null
    tileSlug: null
    x: 0
    y: 6
    w: 12
    h: 3
    properties:
      title: "Note Title"
      content: "Markdown content here"

  # Heading tiles use text property (not title/content)
  - type: heading
    uuid: null
    tileSlug: null
    x: 0
    y: 9
    w: 36
    h: 1
    properties:
      text: "Section Heading"

filters:
  dimensions:
    # Required fields: `operator` and `target` (with `fieldId` and `tableName`)
    # Optional fields: `id` (auto-generated), `values`, `label`, `settings`, `tileTargets`,
    #   `disabled`, `required`, `singleValue`
    - target:
        fieldId: column_name
        tableName: model_name
      operator: equals
      values:
        - "value1"
        - "value2"
      label: null              # Optional — use null or a display label string
      required: true           # From ThoughtSpot is_mandatory
      tileTargets:             # From ThoughtSpot excluded_visualizations
        excluded-chart-slug: false    # Exclude this tile from the filter
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
