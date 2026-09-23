# Prototype: composer pipeline inside the artifact

Throwaway prototype answering: **where should the composer pipeline live in
the thread, and what should it show?** Lives on the `prototype/composer-artifact-pipeline`
branch only. Nothing here is production code; the decisions below are.

## Verdict

**Variant A won**: results on top, the pipeline as a collapsible, resizable
bottom panel inside the artifact. The "Ran composer queries" tool-call row
loses its body. Rejected: B (Results / Pipeline tabs in the header) hides the
result behind a tab; C (node strip above the table with SQL popovers) does not
scale to long SQL.

## Decisions

Layout

- Artifact body is edge to edge. Only the header keeps horizontal padding. The
  results table has no rounded corners or side borders.
- Collapsed: results fill the panel, pipeline is a 38px bar.
- Expanded: a vertical `ResizableSplitter` between results and pipeline,
  defaults 55 / 45, user drags the 1px handle.

Bar

- Left: chevron + uppercase "Queries" heading. Right: "N steps · duration".
- No summary text, no mini graph in the bar.
- Expanded only: a List / Graph segmented control.

List

- Grouped by depth in the DAG: **Sources**, **Transformations** (plural when
  more than one), **Result**. Depth is longest path from a source, so a fan-in
  join lands after everything it reads.
- Transformations heading carries a help icon with the tooltip
  "Transformations run in DuckDB on top of the source results. They never
  touch the warehouse."
- Node row: status dot, title, optional description, "Reads a, b" using
  titles, formatted SQL. Terminal node is suffixed "· result".
- No node ids in the UI. No type label on DuckDB nodes. Source nodes show an
  icon + uppercase label: Semantic layer, Warehouse SQL, External data.
- Semantic-layer nodes show the explore name plus dimension and metric chips
  in Lightdash field colours (`LD_FIELD_COLORS`).
- SQL is formatted with `formatSql`, DuckDB dialect for duckdb and external
  nodes. Code block max-height 420px.
- Rows have a 4px gap, headings 10 / 8 / 8 padding, 12px between sections.

Graph

- Layered left to right by depth, boxes with title and source label, curved
  edges per reference, terminal node has a stronger border.
- Clicking a node switches to List, highlights that row, scrolls it to centre.

Style

- Neutral only: default-variant badges, `ldGray` text, `--mantine-color-dimmed`
  10px uppercase headings (copied from the review findings card), 6px status
  dots (green success, red error, pulsing running). No accent colours for node
  types. Monospace only for SQL.

## Reuse vs rewrite for production

- `composerPipelineDag.ts` (layout by depth, reads) is reusable as-is.
- The hand-written SVG graph is a stand-in. Production uses `@xyflow/react` +
  `@dagrejs/dagre`, already in the bundle for the metrics catalog canvas.
- The flush results treatment is a CSS override on `AiArtifactTableVisualization`'s
  Paper; production adds a prop instead.
- `ToolCallRow` change becomes "no body for `runComposerQueries`", not a
  variant check.
- The `?variant=` switcher and variants B and C are deleted.

## Backend prerequisites

- Per-node `title` and `description` on the `runComposerQueries` tool schema
  and on `AiComposerChartArtifactConfig.queries`. Without them the list falls
  back to node ids as titles.
- Duration and per-node status persisted at tool time so the bar and dots work
  after the run, not only while streaming.

## Where to look

- Story: `packages/frontend/src/stories/AiComposerArtifact.stories.tsx`
  (DagCollapsed, DagExpanded, LinearCollapsed, Running, Failed).
- Component: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiComposerPipelineFooter.tsx`.
- Live on a thread: any composer artifact with `?variant=A` in dev builds.
