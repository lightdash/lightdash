# Lightdash Library — harmony with the built-in charts

Build charts that read as siblings of Lightdash's native charts, not guests.
A user scanning a dashboard should not be able to tell an installed chart type
from a built-in one by its chrome. The attached screenshots are renderings of
**built-in Lightdash charts** with real query data, in both color schemes.
They are the ground truth: match their axes, grids, legend, typography, and
tooltip; bring your chart family's own geometry.

## Start with the evidence

Read the paired light/dark screenshots in `images/` before rendering anything.
`cartesian-line` and `cartesian-area` establish the quiet grid, legend, and
axis treatment. `cartesian-bar` shows the dashed bar-chart grid variant and
category spacing. `big-number` establishes headline typography and the
comparison pill. `table` establishes row chrome and header weight. Extend the
same language to chart families without a built-in counterpart (globe,
heatmap, boxplot, flows): same chrome, same typography, same restraint.

Import `css/lightdash-library.css` before chart-specific CSS. It contains the
paired light/dark chrome tokens (`--ll-*`), the embedded Inter font, and
tooltip utility classes. The separate `fonts/Inter.woff2` is supplied for
tools that consume font assets directly; no network font fetch is needed.

## The visual signature

The canvas is **transparent** — the host tile's surface shows through the
chart, including its rounded corners. Never paint an opaque page background;
the product's surfaces change and a copied hex rots. Data is the only
saturated thing on the canvas: chrome is quiet grays, series colors come from
the host palette.

Set everything in Inter (`var(--ll-font)`). Measurements use tabular
numerals. The scale is small and consistent:

| Element                           | Size                      | Weight                      | Color                           |
| --------------------------------- | ------------------------- | --------------------------- | ------------------------------- |
| Axis labels                       | 11.5px                    | 500                         | `var(--ll-text)`                |
| Axis titles                       | 12px                      | 500                         | `var(--ll-text-muted)`          |
| Legend                            | 12px                      | 500                         | `var(--ll-text)`                |
| Tooltip body / value pill         | 12px                      | 400 / 600                   | `var(--ll-text)`                |
| Tooltip header                    | 13px                      | 500                         | `var(--ll-text)`                |
| Value labels on marks             | 11px                      | 500                         | series color or `var(--ll-ink)` |
| Headline values (big-number-like) | container-scaled 22–128px | 600, letter-spacing −0.02em | `var(--ll-ink)`                 |

Axes and grids are quiet:

- Horizontal gridlines only by default (value axis); no vertical gridlines.
- Line/area/scatter: solid gridlines in `var(--ll-grid-line)`. Any bar
  series present: dashed `3 3` gridlines in `var(--ll-grid-line-bar)`.
- The category axis draws a solid axis line in `var(--ll-axis-line)`; the
  value axis draws no axis line. Tick marks are off.
- Axis titles sit centered along the axis (`nameLocation: center`), gap ~30px
  on the x axis.
- Line/area charts extend to the plot edges (`boundaryGap: false`); bar
  charts keep the category gap (~25% between categories, rounded bar corners
  2–4px on the value end).

Legend: horizontal, top-center, scrollable. Square series use a 12×12
rounded-rect swatch (radius 3); line/area-only charts use the line-with-dot
glyph. Item gap 16, text per the table above. Reserve ~40px of top grid space
when the legend shows.

Tooltip: use the `.ll-tooltip` utilities — white/dark surface
(`var(--ll-tooltip-bg)`), 1px `var(--ll-tooltip-border)` border, radius 8,
padding 8, the standard shadow, a 13px/500 header, a 1px divider, then one
row per series: 10×10 radius-2 color swatch, series name, and the value in a
bordered pill (`.ll-value-pill`). Hover crosshairs are dashed `4 2` in
`var(--ll-pointer-line)`.

Never add empty cards, decorative badges, marketing headings, chart-local
theme switches, or motion that suggests live data. Keep negative space
generous but let the geometry fill the plotting area.

## Color and modes

Use the host-resolved colors first: `resolveValueColor` /
`resolveSeriesColor` from `@lightdash/query-sdk`, falling back to
`colorPalette[index % length]`. This theme deliberately defines **no** data
palette — the instance's palette is authoritative, and a user or model color
override wins over everything. Sequential ramps (heatmaps, choropleths)
derive from `colorPalette[0]` by default, with named schemes only as explicit
user options. Pair color with names, position, or shape; never rely on hue
alone.

Follow the SDK's root `.dark` class via `useColorScheme()`. All `--ll-*`
tokens re-resolve automatically; imperative chart specs (ECharts options,
Vega configs) must be rebuilt on scheme change — a one-time
`getComputedStyle()` read cannot follow later toggles. Every chart must work
on both surfaces, in small dashboard tiles, and in a static screenshot.

## Data and interaction contract

Render only mapped SDK result rows. Never run your own query, invent values,
turn missing values into zeros, or sample away facts without disclosure.
Honor saved options and pivoted results. Empty, invalid, and zero-only states
explain the relevant condition in `var(--ll-text-muted)`.

Never hand-build a data-point action menu when
`useVizContext().pointMenu.enabled` — call `pointMenu.open({ x, y, row, metric })`
and let Lightdash render it; an in-viz menu is only the fallback for hosts that
predate the capability. Preserve native **View underlying data** and **Drill
into** on eligible marks (via `pointMenu`, or the `underlyingData`/`drillDown`
fallback), retaining original result-row references through transforms. Marks
are inspectable by pointer and keyboard. Decorative overlays use
`pointer-events: none`. Scope SVG gradient/mask/pattern IDs uniquely.
Reduced motion disables reveal effects; animation is never the mechanism
that makes data visible.

## Completion check

Put your chart side by side with the closest built-in chart (the screenshots,
or a live instance) in both schemes — the chrome should be indistinguishable;
this is the acceptance test. Verify: small dashboard tile, empty data, the
host palette applied to series, tooltip matches the `.ll-tooltip` chrome,
axis/legend typography matches the table, and a static render is complete
without interaction.
