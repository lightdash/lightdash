# PROD-6994: Configurable initial scroll position for scrollable charts

## Problem

When "Enable scrollable chart" (`enableDataZoom`) is on, the echarts dataZoom slider
always opens on the first data item — `startValue: 0, endValue: 10` is hardcoded in
`useEchartsCartesianConfig.ts`. For flipped (horizontal bar) charts, echarts places
category index 0 at the bottom of the y-axis, so the chart loads showing the bottom
items. Users want to choose to start at the end of the data instead (e.g. show the
top bars by default).

## Goal

Add an option, shown only when scrollable charts are enabled, that controls whether
the initial zoom window anchors at the **start** or the **end** of the data. Default
to **start** to preserve existing behavior.

Out of scope (tracked in PROD-8006/8007): making the *number* of visible items
configurable. The window size stays at the current value (10).

## Design

### 1. Data model — `packages/common/src/types/savedCharts.ts`

Add an optional field to the `XAxis` type:

```ts
export type XAxis = Axis & {
    sortType?: XAxisSortType;
    enableDataZoom?: boolean;
    /** Where the initial data-zoom window anchors when data zoom is enabled */
    dataZoomAnchor?: 'start' | 'end';
};
```

- Omitted or `'start'` → current behavior (window at first item).
- `'end'` → window anchored at the last item.
- A string union (not a boolean) so the persisted value is self-describing and easy
  to extend; matches the "intentional types" house style.

### 2. Rendering — `packages/frontend/src/hooks/echarts/useEchartsCartesianConfig.ts`

In the `eChartsOptions` memo (~line 3559), read the anchor alongside `enableDataZoom`:

```ts
const dataZoomAnchor =
    validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.dataZoomAnchor ?? 'start';
```

Compute the window from the anchor and the item count. The window size is the current
`endValue` (10). Derive the item count from the data already in scope (`dataToRender` /
sorted results length).

- `'start'` → `startValue: 0`, `endValue: WINDOW_SIZE` (unchanged).
- `'end'` → `endValue: lastIndex`, `startValue: max(0, lastIndex - WINDOW_SIZE)`.

`zoomLock`, `minValueSpan`, `maxValueSpan`, slider width/height, and the
`flipAxes ? 'yAxisIndex' : 'xAxisIndex'` selection are unchanged. Add `dataZoomAnchor`
(and any newly referenced data-length value) to the memo dependency array.

### 3. State setter — `packages/frontend/src/hooks/cartesianChartConfig/useCartesianChartConfig.ts`

Add `setDataZoomAnchor` mirroring `setScrollableChart` (~line 521):

```ts
const setDataZoomAnchor = useCallback((dataZoomAnchor: 'start' | 'end') => {
    setDirtyEchartsConfig((prevState) => {
        const [firstAxis, ...axes] = prevState?.xAxis || [];
        return {
            ...prevState,
            xAxis: [{ ...firstAxis, dataZoomAnchor }, ...axes],
        };
    });
}, []);
```

Expose it in the hook's return object next to `setScrollableChart` (~line 1296). The
UI consumes it directly via `visualizationConfig.chartConfig`, so no extra
context/provider threading is needed.

### 4. UI — `packages/frontend/src/components/VisualizationConfigs/ChartConfigPanel/Axes/index.tsx`

When `enableDataZoom` is true, render a Mantine `SegmentedControl` under the existing
checkbox (~line 271):

- Label: **"Initial scroll position"**
- Options: **Start** / **End** (values `'start'` / `'end'`)
- Value: `dirtyEchartsConfig?.xAxis?.[0]?.dataZoomAnchor ?? 'start'`
- `onChange`: `setDataZoomAnchor`
- Destructure `setDataZoomAnchor` from the config hook alongside `setScrollableChart`
  (~line 84).

Follow the frontend style guide (Mantine v8, component props or CSS module for layout,
no `style`/`sx`).

### 5. Persistence / schema

`XAxis` config is already persisted in the saved chart and serialized to chart-as-code.
`chart-as-code-1.0.json` is auto-generated and already enumerates `enableDataZoom` and
`sortType`, so regenerate it:

```bash
pnpm generate:chart-as-code-schema
pnpm check:chart-as-code-schema
```

Run `pnpm generate-api` if controller/service return types are affected (likely not,
since this is a config-only field, but verify the diff).

## Testing / verification

- `pnpm -F common typecheck:fast`, `pnpm -F frontend typecheck:fast`
- `pnpm -F frontend lint` on changed files
- Manual: create a bar chart, flip axes, enable scrollable chart, toggle Start/End and
  confirm the initial visible window moves between the bottom and top of the chart;
  confirm a non-flipped chart moves between left and right; confirm the setting persists
  on save/reload.

## Backwards compatibility

Existing charts have no `dataZoomAnchor`; the `?? 'start'` fallback reproduces today's
behavior exactly.
