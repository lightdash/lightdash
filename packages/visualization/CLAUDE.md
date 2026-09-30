<summary>
`@lightdash/visualization` is the headless chart engine: a saved chart and its
data go in, what to draw comes out (an ECharts option, a table or big number
model, a Vega-Lite spec, or `empty` with a reason). No React, no Mantine, no
DOM. The web app's chart hooks, the React SDK, embedding, the SDK bundle and
Lightdash Desktop all draw through it. It never runs a query.
</summary>

<howToUse>
**Two entry points, two audiences.**

- `@lightdash/visualization` (`src/index.ts`): the public API.
  `renderChart(chart, data, options)` = `buildChart(resolveChart(chart, data, options), data, options)`.
  `ChartView` is what the chart is (a `SavedChart` fits), `ChartData` everything
  it is drawn from (rows, fields keyed by id, optional query, pivot details,
  totals, subtotals, pivot table), `RenderOptions` how to draw it. Keep it stable.
- `@lightdash/visualization/editor` (`src/editor.ts`): the per-type helpers the
  explorer's editor hooks call. An **explicit list** of exactly what
  `packages/frontend` imports. When the frontend needs a new helper, add its
  name there; the frontend's `unused-exports` check and typecheck tell you
  what is missing or stale.

**Layout.** One folder per chart type: `config.ts` (the resolver
`resolve<Type>ChartConfig` and the pure editor helpers) and `echartsOption.ts`
or `model.ts` (the builder). `render.ts` switches over chart types;
`chartData.ts` turns `ChartData` into the builders' inputs; `themeColors.ts`
resolves Mantine CSS variables; `colors/` holds series identity and colour
assignment.

**Adding a chart type or option:** add the resolver and builder in its folder,
a case in `resolveChart` and `buildChart` (`render.ts`), the editor helpers the
frontend needs to `editor.ts`, and keep the frontend hooks thin wrappers.
See `packages/frontend/src/components/LightdashVisualization/CLAUDE.md` for
the rest of the chart-type checklist.
</howToUse>

<codeExample>

```ts
import { renderChart, toResultRows } from '@lightdash/visualization';

const rendered = renderChart(
    savedChart,
    { rows: toResultRows(rawRows, fields), fields, query: metricQuery },
    { theme, colors: { palette, assignments }, size: { width, height } },
);
if (rendered.kind === 'empty') console.log(rendered.reason); // noRows, incompleteConfig, needsPivotDetails, needsPivotTable
nextAssignments = rendered.colorAssignments; // pass to the next chart on the page
```

</codeExample>

<importantToKnow>
**The web app must keep drawing exactly what it drew.** Every chart in
Lightdash goes through this package. A change here is behaviour-neutral for
the web app unless the change is the point; a bug fix that changes what saved
charts show ships as its own PR, called out as such. Prove it with the
regression replay before opening a PR that touches chart logic:

```
pnpm -F visualization test:regression                 # against origin/main
pnpm -F visualization test:regression --base <ref> --modes light,dark
```

It builds ~900 charts through the frontend's own hooks on the base ref and on
this checkout (explorer light/dark, dashboard tile, shared series colours,
pivoted tables with the real pivot worker, editor actions) and fails on any
difference in options, formatter output or config models. The first run sets
up and installs a base worktree beside the repo; later runs take about 75 s.

**Deliberate differences between the web app and `renderChart`:**

- Colours. The builders keep Mantine's CSS variables, as the web app always
  had: its image exports draw the SVG without the stylesheet and rely on the
  variables' light fallbacks. `buildChart` resolves them against the theme
  (`resolveThemeColors`) so a headless option draws the same anywhere. `gray`
  and `black` are left to their fallbacks: Lightdash keeps `gray` light in dark
  mode and customises `black`.
- Treemap parents without subtotals. The explorer leaves them at 0 (ECharts
  draws nothing until the subtotals query answers; a sum is wrong for
  averages). `renderChart` passes `sumParentsWithoutSubtotals`.

**Known main behaviour kept on purpose:** bar-totals sort only matches string
categories (numeric categories keep query order). Fixing it changes saved
charts; do it in its own PR.

**Gotchas.**

- The frontend's tests and typecheck read this package's `dist`, not `src`:
  run `pnpm -F visualization build` before testing the frontend. `pnpm dev`
  runs `visualization-watch` for that.
- `pnpm -F visualization test:browser` reuses a server on port 3011; if a dev
  environment from another checkout holds that port, the run tests that
  checkout's code. Stop it or run on another port.
- `calculateWidthText` measures axis labels with a DOM span, exactly as the
  web app always did, cached by text and body font (never while web fonts
  load). A canvas measurement differs by up to 1px; do not switch.
- Label widths are 0 in jsdom; headless (no `document`) estimates 7px per char.

**Checks.** `pnpm -F visualization lint typecheck test build test:pack`
(`test:pack` installs the packed tarball outside the repo and runs it from
plain Node as ESM and CJS; the unit tests also typecheck every README sample).
In the frontend: `visualizationParity.test.tsx` asserts app hooks == `renderChart`.
</importantToKnow>

<links>
- `README.md`: install, usage, Node/bundler support.
- `scripts/regression/`: the replay (`run.mjs`, cases in `fixtures.ts`).
- `packages/frontend/src/components/LightdashVisualization/visualizationParity.test.tsx`, `visualizationDifferential.test.tsx`.
- `browser/`: Playwright specs drawing every type in Chromium.
</links>
