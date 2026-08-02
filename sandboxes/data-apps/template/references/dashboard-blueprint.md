# Dashboard blueprint (dashboard attached to the prompt)

> Read this when the prompt announces an attached dashboard with a blueprint at
> `/tmp/dashboard/blueprint.json`.

## Contents

- What the blueprint JSON contains
- How to map tabs, the tile grid, and tile types to app structure
- How to wire dashboard filters as interactive controls
- What to skip and when to deviate

The user attached a Lightdash dashboard. The blueprint is its full structural
definition — use it as the layout spec and recreate the dashboard's design,
instead of inventing a layout from scratch. The chart queries themselves live in
`/tmp/metric-queries/*.json` (see `chart-references.md`); the blueprint tells you
how those charts were arranged and filtered.

## Blueprint shape

```jsonc
{
  "dashboardUuid": "…",
  "name": "Sales overview",          // use as the app title unless the user names it
  "description": "…",                // may be null
  "tabs": [                          // sorted by order; [] when the dashboard has no tabs
    { "uuid": "tab-1", "name": "Summary", "order": 0, "hidden": false }
  ],
  "tiles": [ /* see below */ ],
  "filters": {                       // dashboard-level filters
    "dimensions": [ /* DashboardFilterRule */ ],
    "metrics": [],
    "tableCalculations": []
  },
  "parameters": { /* default parameter values, or null */ },
  "config": { /* date-zoom settings etc., or null */ }
}
```

### Tiles

Every tile has: `uuid`, `type`, `x`, `y`, `w`, `h`, `tabUuid`, `properties`.

**Grid geometry:** positions are on a **36-column grid** — `x`/`w` are column
units (a full-width tile is `w: 36`, a half-width tile `w: 18`), `y`/`h` are row
units of roughly 55px. Translate proportionally into your layout (e.g. CSS grid
with 12 columns: divide `x`/`w` by 3). Preserve the relative arrangement — what
sits side by side, what spans full width, the top-to-bottom order — rather than
the pixel-exact math. `tabUuid` says which tab the tile belongs to (`null` when
the dashboard has no tabs).

Tile types and their `properties`:

- `saved_chart` — `savedChartUuid`, `chartName`, optional `title` (falls back to
  the chart name) and `hideTitle`. **Match it to its metric-query file via
  `savedChartUuid` = the `chartUuid` field inside each
  `/tmp/metric-queries/*.json`.** Build the tile's visualization from that
  file's `metricQuery` + `chartConfig` (or `savedChart(uuid)` when the file says
  LINKED).
- `markdown` — `title`, `content` (markdown source). Recreate as a text/prose
  section.
- `heading` — `text`, `showDivider`. Recreate as a section header.
- `loom` — `title`, `url`. Recreate as a link out to the video (do not embed
  arbitrary iframes).
- `sql_chart` — `savedSqlUuid`, `chartName`. Its query is NOT available in
  `/tmp/metric-queries/`. Keep its place in the layout: render a clearly
  labelled placeholder card with the tile's title, or rebuild it from catalog
  fields if the prompt makes the intent obvious.
- `data_app` — an embedded data app. Skip it; note it in a comment.

### Tabs

Recreate tabs as top-level navigation (tab bar / segmented control), one view
per tab, tiles assigned by `tabUuid`, ordered by `order`. Skip tabs with
`hidden: true`. Single implicit tab (empty `tabs`) → a single page, no tab
chrome.

### Dashboard filters

Each rule in `filters.dimensions` is a `DashboardFilterRule`: `target`
(`fieldId`, `tableName`), `operator`, `values`, `label`, and `tileTargets`.
Recreate these as the app's interactive filter controls (see the global-filters
guidance in `skill.md`):

- One control per rule; `label` (or the target field's label) is the control's
  caption; `values` are the default selection; `disabled: true` means "no
  default value" — start unfiltered.
- `tileTargets` maps tile `uuid` → the field to filter on for that tile, or
  `false` when the rule must NOT apply to that tile. A missing entry means
  "apply with the rule's own target field". Respect exclusions — that a chart is
  exempt from a filter is deliberate dashboard design.
- Apply selections via `.filters()` — inline convention for `query(...)`,
  qualified ids for `savedChart(...)` (rules in `chart-references.md`).

## When to deviate

The blueprint wins on structure (tabs, arrangement, which filters exist) unless
the user's prompt asks for something different — the prompt always wins. You may
modernize presentation (spacing, typography, card styling per the design skill)
while keeping the structure recognizably the same dashboard.
