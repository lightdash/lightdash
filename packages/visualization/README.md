# @lightdash/visualization

The headless Lightdash chart engine. It turns a saved chart's config and the
results of its query into what a renderer needs: an ECharts option for bar,
line, area, scatter, pie, funnel, treemap, gauge and sankey charts, a table
model, a big number model, and the data for a custom (Vega) visualization.

No React, no Mantine, no DOM. The Lightdash frontend renders every chart
through this package, so a headless caller (a data app, a server-side render, a
desktop app) draws exactly what the web app draws.

## Using it

A chart and its data go in; what to draw comes out.

```ts
import { renderChart, toResultRows } from '@lightdash/visualization';

const rendered = renderChart(
    savedChart, // chartConfig, pivotConfig, tableConfig: a SavedChart as it is
    {
        rows: toResultRows(rawRows, fields),
        fields, // keyed by field id: Lightdash items, or { fieldType, type, label, format }
        query: metricQuery, // optional: field order and sorts
        pivotDetails, // when the query was pivoted
    },
    { theme, colors: { palette }, size: { width, height } },
);

switch (rendered.kind) {
    case 'echarts':     echarts.init(el).setOption(rendered.option); break;
    case 'table':       rendered.model.columns; rendered.model.rows; break;
    case 'bigNumber':   rendered.model.value; rendered.model.comparison; break;
    case 'custom':      rendered.spec; rendered.data; break;
    case 'empty':       rendered.reason; break; // noRows, incompleteConfig, needsPivotDetails, needsPivotTable
    case 'unsupported': break; // maps and data-app visualizations
}
```

- **`ChartView`**: what the chart is. A `SavedChart` satisfies it.
- **`ChartData`**: everything it is drawn from, all of it data. Values that
  took further queries (`totals`, `groupedSubtotals`, `pivotTable`) are
  fields of it. The engine never runs a query: what it needs and is not
  given comes back as an `empty` reason.
- **`RenderOptions`**: how to draw, never what. `theme`, `colors`, `size`,
  `animation`, `tooltip`, `legendSelection`, `parameters`.
- **`RenderedChart`**: the output, plus `colorAssignments`. Pass those back
  as `colors.assignments` to the next chart on the page, and the same group
  value keeps its colour. They are plain data: keep them, send them, compare
  them.

`renderChart` is `resolveChart` then `buildChart`. Call them apart to keep
the resolved chart: its `config` is the saved config with defaults filled
and stale fields repaired, the same config the explorer's editor settles on.

## Entry points

- `@lightdash/visualization`: the API above. Stable.
- `@lightdash/visualization/editor`: the per-type helpers the Lightdash
  explorer's editor calls to offer, repair and default a config. Internal to
  Lightdash; it changes with the explorer.

## Layout

- `render.ts`: `resolveChart`, `buildChart`, `renderChart` and their types.
- `chartData.ts`: `ChartView`, `ChartData`, and how they become the
  builders' inputs.
- `types.ts`: `VisualizationResults`, the structural subset of the frontend's
  query results the builders read, and the inputs every builder shares.
- `theme.ts`: `VisualizationTheme` and the light and dark defaults. Plain hex
  values, so options rasterise without a stylesheet.
- `colors/`: series identifiers, colour assignments, the colour resolver.
- `pivot/`, `merge/`: pivoted results and merged-query helpers.
- One folder per chart type: `config.ts` (the resolver and the pure helpers
  the frontend's editor hook calls) and `echartsOption.ts` (the builder).

## Working on it

The frontend hooks under `packages/frontend/src/hooks/echarts` and the
`use<Type>ChartConfig` hooks are thin wrappers over this package; the editor
state stays in the frontend. Keep a change here behaviour-neutral for the
frontend, or change both together.

```
pnpm -F visualization build      # dist/esm, dist/cjs, dist/types
pnpm -F visualization test
pnpm -F visualization lint
pnpm -F visualization typecheck
```

In development the frontend resolves the package from `src` through a Vite
alias, and `pnpm dev` runs a `visualization-watch` build for the backend and
the SDK bundle.

### Browser tests

`browser/` draws every chart type through `renderChart` into real ECharts
instances in Chromium, and Playwright asserts on what the browser produces:
series marks, axis labels, legends, the tooltip HTML, the big number and
table models, and the dark theme's colours. The report carries a gallery of
every type in both themes.

```
pnpm -F visualization exec playwright install chromium   # once
pnpm -F visualization test:browser
```

The unit tests check the options the engine builds; the browser tests check
that a browser draws them.
