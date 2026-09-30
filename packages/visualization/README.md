# @lightdash/visualization

The headless Lightdash chart engine. It turns a saved chart's config and the
results of its query into what a renderer needs: an ECharts option for bar,
line, area, scatter, pie, funnel, treemap, gauge and sankey charts, a table
model, a big number model, and the data for a custom (Vega) visualization.

No React, no Mantine, no DOM. The Lightdash frontend renders every chart
through this package, so a headless caller (a data app, a server-side render, a
desktop app) draws exactly what the web app draws.

## Using it

One call renders any saved chart:

```ts
import { renderChart, toResultRows } from '@lightdash/visualization';

const rendered = renderChart({
    chartConfig: savedChart.chartConfig,
    pivotConfig: savedChart.pivotConfig,
    columnOrder: savedChart.tableConfig.columnOrder,
    results: { rows: toResultRows(rawRows, itemsMap), fields: itemsMap, metricQuery },
    itemsMap,
    colorPalette,
});

switch (rendered.kind) {
    case 'echarts':   echarts.init(el).setOption(rendered.option); break;
    case 'table':     rendered.model.columns; rendered.model.rows; break;
    case 'bigNumber': rendered.model.value; rendered.model.comparison; break;
    case 'custom':    rendered.spec; rendered.data.series; break;
    case 'empty':     /* no rows, or no usable field */ break;
    case 'unsupported': /* maps and data-app visualizations */ break;
}
```

`renderChart` takes a `theme` (light by default), a `size` for gauges, shared
`colorMappings` so the same group value keeps its color across a page, and
the network-derived values a table or treemap needs: `totals`,
`groupedSubtotals`, `pivotData`.

The two steps behind it are available per chart type when a caller wants to
keep the resolved config, for instance to edit it:

```ts
import {
    buildCartesianEchartsOption,
    createColorMappings,
    createSeriesColorResolver,
    LIGHT_VISUALIZATION_THEME,
    resolveCartesianChartConfig,
} from '@lightdash/visualization';

// 1. Resolve the saved config against the results, as the explorer does
//    when it mounts a chart: default fields, one series per y field and
//    pivot value, reference lines placed, stale settings cleared.
const validCartesianConfig = resolveCartesianChartConfig({
    chartConfig: savedChart.chartConfig.config,
    resultsData: { rows, fields: itemsMap, metricQuery, pivotDetails },
    itemsMap,
    pivotKeys: savedChart.pivotConfig?.columns,
    columnOrder: savedChart.tableConfig.columnOrder,
});

// 2. Colors: the org palette, plus shared mappings so the same group value
//    gets the same color across the charts of one page.
const { getSeriesColor, getGroupColor } = createSeriesColorResolver({
    colorPalette,
    colorMappings: createColorMappings(),
    nullColor: LIGHT_VISUALIZATION_THEME.gray[6],
    chartConfig: { type: ChartType.CARTESIAN, config: validCartesianConfig },
    itemsMap,
});

// 3. The ECharts option.
const option = buildCartesianEchartsOption({
    validCartesianConfig,
    pivotDimensions: savedChart.pivotConfig?.columns,
    resultsData: { rows, fields: itemsMap, metricQuery, pivotDetails },
    itemsMap,
    getSeriesColor,
    colorPalette,
    theme: LIGHT_VISUALIZATION_THEME,
});
```

The engine never runs a query. Rows can come from the query API, the query
SDK, a CSV, or anything else keyed by field id; `toResultRows(rawRows, itemsMap)`
formats them the way the builders expect.

Every chart type follows the same two steps: `resolve<Type>ChartConfig` then
`build<Type>EchartsOption` (or `build<Type>Model` for the table and the big
number). Anything that needs the network, such as table totals and treemap
subtotals, is an input.

## Entry points

- `@lightdash/visualization`: the surface above. What a renderer needs and
  nothing else.
- `@lightdash/visualization/editor`: everything, including the pure helpers
  the Lightdash explorer's editing hooks call between keystrokes (layout
  repair, series expansion, eligibility checks, table column predicates).
  The frontend imports this one.

## Layout

- `types.ts`: `VisualizationResults`, the structural subset of the frontend's
  query results the builders read, and the inputs every builder shares.
- `theme.ts`: `VisualizationTheme` and the light and dark defaults. Plain hex
  values, so options rasterise without a stylesheet.
- `colors/`: series identifiers, shared color mappings, the color resolver.
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
