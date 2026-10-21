import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    QueryHistoryStatus,
    type ChartConfig,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
} from '@lightdash/common';
import type * as VisualizationEditor from '@lightdash/visualization/editor';
import { act, cleanup, waitFor } from '@testing-library/react';
import EChartsReactClass from 'echarts-for-react';
import { StrictMode, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SimpleChart from '.';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import {
    fakeResizeObserverEntry,
    FakeResizeObserver,
    resizeObservers,
    resizeTarget,
} from '../../testing/fakeResizeObserver';
import { renderWithProviders } from '../../testing/testUtils';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';

/**
 * How many ECharts instances, option builds and setOption calls the cartesian
 * chart costs, and which instance its listeners and refs point at.
 */

const builds = vi.hoisted(() => ({
    chartData: 0,
    option: 0,
    changed: [] as string[][],
    last: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@lightdash/visualization/editor', async (importOriginal) => {
    const actual = await importOriginal<typeof VisualizationEditor>();
    return {
        ...actual,
        buildCartesianChartData: (
            ...args: Parameters<typeof actual.buildCartesianChartData>
        ) => {
            builds.chartData += 1;
            const input = args[0] as unknown as Record<string, unknown>;
            builds.changed.push(
                Object.keys(input).filter(
                    (key) => builds.last?.[key] !== input[key],
                ),
            );
            builds.last = input;
            return actual.buildCartesianChartData(...args);
        },
        buildCartesianEchartsOptionFromData: (
            ...args: Parameters<
                typeof actual.buildCartesianEchartsOptionFromData
            >
        ) => {
            builds.option += 1;
            return actual.buildCartesianEchartsOptionFromData(...args);
        },
    };
});

const measuredWidths = vi.hoisted(() => [] as (number | null)[]);
vi.mock(
    '../../hooks/echarts/useEchartsCartesianConfig',
    async (importOriginal) => {
        const actual = await importOriginal<{
            default: (...args: unknown[]) => unknown;
        }>();
        return {
            ...actual,
            default: (...args: unknown[]) => {
                measuredWidths.push(
                    (args[2] as number | null | undefined) ?? null,
                );
                return actual.default(...args);
            },
        };
    },
);

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

type Core = {
    ele: HTMLElement | null;
    echarts: {
        getInstanceByDom: (el: HTMLElement) => { id: string } | undefined;
    };
};
const proto = EChartsReactClass.prototype as unknown as Record<
    string,
    (...args: unknown[]) => unknown
>;

const counts = {
    renderNewEcharts: 0,
    updateEChartsOption: 0,
    dispose: 0,
    // getEchartsInstance calls that had to init a fresh instance
    lazyInits: 0,
    getInstance: 0,
};
const instances: { id: string; isDisposed: () => boolean }[] = [];

const dimension = (name: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});
const metric = (name: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});
const fields: ItemsMap = {
    orders_status: dimension('status'),
    orders_revenue: metric('revenue'),
    orders_count: metric('count'),
};
const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_revenue', 'orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};
const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });
const STATUSES = ['completed', 'shipped', 'returned'];
const makeRows = (scale: number, statuses: string[]) =>
    statuses.map((status, i) => ({
        orders_status: cell(status),
        orders_revenue: cell((i + 1) * 100 * scale),
        orders_count: cell((i + 1) * scale),
    }));
const makeResults = (
    scale = 1,
    statuses = STATUSES,
): InfiniteQueryResults & { metricQuery: MetricQuery; fields: ItemsMap } => {
    const rows = makeRows(scale, statuses);
    return {
        queryUuid: `query-${scale}-${statuses.length}`,
        queryStatus: QueryHistoryStatus.READY,
        rows,
        totalResults: rows.length,
        isInitialLoading: false,
        isFetchingFirstPage: false,
        isFetchingRows: false,
        isFetchingAllPages: false,
        fetchMoreRows: () => {},
        refetchRows: async () => {},
        setFetchAll: () => {},
        fetchAll: false,
        hasFetchedAllRows: true,
        totalClientFetchTimeMs: undefined,
        error: null,
        metricQuery,
        fields,
    };
};
const chartConfig: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'orders_status',
            yField: ['orders_revenue', 'orders_count'],
        },
        eChartsConfig: {
            series: ['orders_revenue', 'orders_count'].map((yField) => ({
                type: 'bar' as never,
                encode: {
                    xRef: { field: 'orders_status' },
                    yRef: { field: yField },
                },
                yAxisIndex: 0,
            })),
        },
    },
};
const palette = ['#111111', '#222222', '#333333'];
const columnOrder = ['orders_status', 'orders_revenue', 'orders_count'];
const noopContextMenu = () => {};

type ChartProps = {
    results: ReturnType<typeof makeResults>;
    isLoading?: boolean;
    isDashboard?: boolean;
    containerWidth?: number;
    onSeriesContextMenu?: (e: unknown, series: unknown[]) => void;
    setEchartsRef?: (ref: unknown) => void;
    theme?: string;
    onChartReady?: (instance: unknown) => void;
    onScreenshotReady?: () => void;
};
const Chart = ({
    results,
    isLoading = false,
    isDashboard = false,
    containerWidth,
    onSeriesContextMenu,
    setEchartsRef,
    theme,
    onChartReady,
    onScreenshotReady,
}: ChartProps) => (
    <VisualizationProvider
        chartConfig={chartConfig}
        initialPivotDimensions={undefined}
        resultsData={results}
        isLoading={isLoading}
        columnOrder={columnOrder}
        colorPalette={palette}
        isDashboard={isDashboard}
        containerWidth={containerWidth}
        onSeriesContextMenu={onSeriesContextMenu}
        setEchartsRef={setEchartsRef}
    >
        <SimpleChart
            isInDashboard={isDashboard}
            $shouldExpand
            theme={theme}
            onChartReady={onChartReady}
            onScreenshotReady={onScreenshotReady}
        />
    </VisualizationProvider>
);

const wrap = (node: ReactNode, strict: boolean) => {
    const tree = (
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                {node}
            </ChartColorMappingContextProvider>
        </MemoryRouter>
    );
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
};

type Handlers = { _$handlers?: Record<string, unknown[]> };
const listenerCount = () => {
    const live = instances.filter(
        (i) => !i.isDisposed(),
    ) as unknown as (Handlers & { getZr: () => Handlers })[];
    const total = (h: Handlers) =>
        Object.values(h._$handlers ?? {}).reduce(
            (sum, list) => sum + list.length,
            0,
        );
    return live.reduce((sum, i) => sum + total(i) + total(i.getZr()), 0);
};

const snapshot = () => ({
    init: counts.renderNewEcharts,
    setOption: counts.updateEChartsOption,
    dispose: counts.dispose,
    getInstance: counts.getInstance,
    chartData: builds.chartData,
    option: builds.option,
    alive: instances.filter((i) => !i.isDisposed()).length,
    listeners: listenerCount(),
});
const delta = (
    from: ReturnType<typeof snapshot>,
    to: ReturnType<typeof snapshot>,
) =>
    Object.fromEntries(
        Object.entries(to).map(([key, value]) => [
            key,
            value - from[key as keyof typeof from],
        ]),
    );
const takeChanged = () => builds.changed.splice(0);
type LiveInstance = {
    id: string;
    getDom: () => HTMLElement;
    trigger: (type: string, e: object) => void;
};
const liveInstances = () =>
    instances.filter((i) => !i.isDisposed()) as unknown as LiveInstance[];
const clickSeries = (instance: LiveInstance, dataIndex = 0) =>
    act(() => {
        instance.trigger('click', {
            componentType: 'series',
            seriesIndex: 0,
            dataIndex,
            event: { event: new MouseEvent('click') },
        });
    });
// 300 rows x 2 series crosses the 500 point canvas threshold
const MANY_STATUSES = Array.from({ length: 300 }, (_, i) => `status-${i}`);

describe('ECharts lifecycle characterization (cartesian)', () => {
    beforeEach(() => {
        Object.assign(counts, {
            renderNewEcharts: 0,
            updateEChartsOption: 0,
            dispose: 0,
            lazyInits: 0,
            getInstance: 0,
        });
        builds.chartData = 0;
        builds.option = 0;
        builds.changed = [];
        builds.last = undefined;
        instances.length = 0;
        for (const key of [
            'renderNewEcharts',
            'updateEChartsOption',
            'dispose',
        ] as const) {
            const original = proto[key];
            vi.spyOn(proto, key).mockImplementation(function (
                this: unknown,
                ...args
            ) {
                counts[key] += 1;
                return original.apply(this, args);
            });
        }
        const getInstance = proto.getEchartsInstance;
        vi.spyOn(proto, 'getEchartsInstance').mockImplementation(function (
            this: Core,
            ...args
        ) {
            counts.getInstance += 1;
            const existed =
                !!this.ele && !!this.echarts.getInstanceByDom(this.ele);
            const instance = getInstance.apply(this, args) as {
                id: string;
                isDisposed: () => boolean;
            };
            if (!existed) {
                counts.lazyInits += 1;
                instances.push(instance);
            }
            return instance;
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('mounts one instance and applies the effect-settled config with setOption', () => {
        renderWithProviders(wrap(<Chart results={makeResults(1)} />, false));
        expect(snapshot()).toMatchObject({
            init: 1,
            dispose: 0,
            setOption: 3,
            listeners: 5,
            chartData: 3,
            alive: 1,
        });
        expect(takeChanged().slice(1)).toEqual([
            ['validCartesianConfig'],
            ['validCartesianConfig'],
        ]);
    });

    it('does no work when the parent re-renders with the same or unrelated props', () => {
        const results = makeResults(1);
        const view = renderWithProviders(
            wrap(<Chart results={results} />, false),
        );
        const mounted = snapshot();
        view.rerender(wrap(<Chart results={results} />, false));
        view.rerender(
            wrap(<Chart results={results} containerWidth={640} />, false),
        );
        expect(delta(mounted, snapshot())).toMatchObject({
            init: 0,
            setOption: 0,
            chartData: 0,
        });
    });

    it('keeps the instance on a results change, though the config lag still builds twice', () => {
        const view = renderWithProviders(
            wrap(<Chart results={makeResults(1)} />, false),
        );
        takeChanged();
        const mounted = snapshot();
        view.rerender(wrap(<Chart results={makeResults(2)} />, false));
        expect(delta(mounted, snapshot())).toMatchObject({
            chartData: 2,
            init: 0,
            dispose: 0,
            setOption: 2,
            alive: 0,
            listeners: 0,
        });
        // The first build pairs the new rows with the previous config
        expect(takeChanged()).toEqual([
            ['resultsData'],
            ['validCartesianConfig'],
        ]);
    });

    it('keeps the instance on a legend toggle', async () => {
        renderWithProviders(wrap(<Chart results={makeResults(1)} />, false));
        const before = snapshot();
        const instance = instances.at(-1) as unknown as {
            dispatchAction: (action: object) => void;
        };
        act(() => {
            instance.dispatchAction({
                type: 'legendToggleSelect',
                name: 'orders_count',
            });
        });
        await waitFor(() => expect(builds.option).toBe(before.option + 1));
        expect(delta(before, snapshot())).toMatchObject({
            chartData: 0,
            option: 1,
            setOption: 1,
            init: 0,
            dispose: 0,
            listeners: 0,
        });
    });

    it('keeps the instance and hover listeners when only the context menu handler changes', () => {
        const results = makeResults(1);
        const view = renderWithProviders(
            wrap(<Chart results={results} />, false),
        );
        const before = snapshot();
        view.rerender(
            wrap(
                <Chart
                    results={results}
                    onSeriesContextMenu={noopContextMenu}
                />,
                false,
            ),
        );
        expect(delta(before, snapshot())).toMatchObject({
            option: 0,
            init: 0,
            setOption: 0,
            listeners: 0,
        });
    });

    it('routes a click to the latest handler without an option change', () => {
        const results = makeResults(1);
        const calls: string[] = [];
        const view = renderWithProviders(
            wrap(
                <Chart
                    results={results}
                    onSeriesContextMenu={() => calls.push('first')}
                />,
                false,
            ),
        );
        view.rerender(
            wrap(
                <Chart
                    results={results}
                    onSeriesContextMenu={() => calls.push('second')}
                />,
                false,
            ),
        );
        clickSeries(liveInstances()[0]);
        // Without a handler the click falls through to native behaviour
        view.rerender(wrap(<Chart results={results} />, false));
        const event = new MouseEvent('click', { cancelable: true });
        act(() => {
            liveInstances()[0].trigger('click', {
                componentType: 'series',
                seriesIndex: 0,
                dataIndex: 0,
                event: { event },
            });
        });
        expect(calls).toEqual(['second']);
        expect(event.defaultPrevented).toBe(false);
        expect(snapshot()).toMatchObject({ init: 1, alive: 1 });
    });

    it('re-creates and rebinds the instance when the renderer switches across the canvas threshold', () => {
        const received: unknown[] = [];
        const onSeriesContextMenu = (e: unknown) => received.push(e);
        const view = renderWithProviders(
            wrap(
                <Chart
                    results={makeResults(1)}
                    onSeriesContextMenu={onSeriesContextMenu}
                />,
                false,
            ),
        );
        const svg = snapshot();
        view.rerender(
            wrap(
                <Chart
                    results={makeResults(1, MANY_STATUSES)}
                    onSeriesContextMenu={onSeriesContextMenu}
                />,
                false,
            ),
        );
        expect(delta(svg, snapshot())).toMatchObject({
            init: 1,
            dispose: 1,
            alive: 0,
            listeners: 0,
        });
        clickSeries(liveInstances()[0], 299);
        expect(received.at(-1)).toMatchObject({
            datasetRow: { orders_status: 'status-299' },
        });
        const canvas = snapshot();
        view.rerender(
            wrap(
                <Chart
                    results={makeResults(2)}
                    onSeriesContextMenu={onSeriesContextMenu}
                />,
                false,
            ),
        );
        expect(delta(canvas, snapshot())).toMatchObject({
            init: 1,
            dispose: 1,
            alive: 0,
            listeners: 0,
        });
    });

    it('re-creates and rebinds the instance on a theme change, chaining onChartReady', () => {
        const results = makeResults(1);
        const ready: string[] = [];
        const onChartReady = (instance: unknown) =>
            ready.push((instance as LiveInstance).id);
        const view = renderWithProviders(
            wrap(
                <Chart results={results} onChartReady={onChartReady} />,
                false,
            ),
        );
        const before = snapshot();
        view.rerender(
            wrap(
                <Chart
                    results={results}
                    theme="dark"
                    onChartReady={onChartReady}
                />,
                false,
            ),
        );
        expect(delta(before, snapshot())).toMatchObject({
            init: 1,
            dispose: 1,
            // The re-init's own setOption; the option itself is unchanged
            setOption: 1,
            option: 0,
            alive: 0,
            listeners: 0,
        });
        expect(ready).toEqual(instances.map((i) => i.id));
        expect(ready.at(-1)).toBe(liveInstances()[0].id);
    });

    it('signals screenshot readiness once and exports the live instance', () => {
        const onScreenshotReady = vi.fn();
        const refs: { current: { getEchartsInstance: () => unknown } }[] = [];
        const setEchartsRef = (ref: unknown) =>
            refs.push(ref as (typeof refs)[number]);
        const view = renderWithProviders(
            wrap(
                <Chart
                    results={makeResults(1)}
                    onScreenshotReady={onScreenshotReady}
                    setEchartsRef={setEchartsRef}
                />,
                false,
            ),
        );
        view.rerender(
            wrap(
                <Chart
                    results={makeResults(2)}
                    onScreenshotReady={onScreenshotReady}
                    setEchartsRef={setEchartsRef}
                />,
                false,
            ),
        );
        expect(onScreenshotReady).toHaveBeenCalledTimes(1);
        expect(refs.at(-1)?.current.getEchartsInstance()).toBe(
            liveInstances()[0],
        );
        expect(counts.lazyInits).toBe(1);
    });

    it('routes a click after a results change to the latest series', () => {
        const received: number[] = [];
        const onSeriesContextMenu = (_e: unknown, series: unknown[]) => {
            received.push(series.length);
        };
        const view = renderWithProviders(
            wrap(
                <Chart
                    results={makeResults(1)}
                    onSeriesContextMenu={onSeriesContextMenu}
                />,
                false,
            ),
        );
        view.rerender(
            wrap(
                <Chart
                    results={makeResults(2)}
                    onSeriesContextMenu={onSeriesContextMenu}
                />,
                false,
            ),
        );
        const live = liveInstances();
        expect(live).toHaveLength(1);
        clickSeries(live[0]);
        expect(received).toEqual([2]);
    });

    it('keeps the live chart and ref when setEchartsRef changes identity', () => {
        const results = makeResults(1);
        const refs: { current: unknown }[] = [];
        const capture = (ref: unknown) =>
            refs.push(ref as { current: unknown });
        const view = renderWithProviders(
            wrap(<Chart results={results} setEchartsRef={capture} />, false),
        );
        expect(snapshot().alive).toBe(1);
        view.rerender(
            wrap(
                <Chart
                    results={results}
                    setEchartsRef={(ref) => capture(ref)}
                />,
                false,
            ),
        );
        expect(snapshot()).toMatchObject({ alive: 1, listeners: 5, init: 1 });
        expect(refs.at(-1)).toBe(refs[0]);
        expect(
            (
                refs.at(-1)?.current as { getEchartsInstance: () => unknown }
            ).getEchartsInstance(),
        ).toBe(liveInstances()[0]);
    });

    it.each([false, true])(
        'leaves exactly one live instance and disposes it on unmount (strict=%s)',
        (strict) => {
            const view = renderWithProviders(
                wrap(<Chart results={makeResults(1)} />, strict),
            );
            view.rerender(
                wrap(<Chart results={makeResults(2)} isLoading />, strict),
            );
            expect(snapshot().alive).toBe(0);
            view.rerender(wrap(<Chart results={makeResults(3)} />, strict));
            expect(snapshot()).toMatchObject({ alive: 1, listeners: 5 });
            const beforeUnmount = snapshot();
            view.unmount();
            // echarts-for-react is the only owner that disposes
            expect(delta(beforeUnmount, snapshot())).toMatchObject({
                dispose: 1,
                getInstance: 0,
                alive: -1,
            });
        },
    );

    it('keeps sibling charts isolated on unmount', () => {
        const first = makeResults(1);
        const view = renderWithProviders(
            wrap(
                <>
                    <Chart results={first} isDashboard />
                    <Chart results={makeResults(2)} isDashboard />
                </>,
                false,
            ),
        );
        expect(snapshot().alive).toBe(2);
        view.rerender(wrap(<Chart results={first} isDashboard />, false));
        expect(snapshot()).toMatchObject({ alive: 1, listeners: 5 });
    });
});

describe('cartesian measurement across a reload', () => {
    beforeEach(() => {
        resizeObservers.clear();
        measuredWidths.length = 0;
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('stops observing the unmounted chart while loading and measures the new one', () => {
        const ready: LiveInstance[] = [];
        const onChartReady = (instance: unknown) =>
            ready.push(instance as LiveInstance);
        const results = makeResults(1);
        const view = renderWithProviders(
            wrap(
                <Chart results={results} onChartReady={onChartReady} />,
                false,
            ),
        );
        const firstDom = ready[0].getDom();
        resizeTarget(firstDom, 640, 400);
        expect(measuredWidths.at(-1)).toBe(640);
        const [firstObserver] = resizeObservers;

        view.rerender(
            wrap(
                <Chart
                    results={results}
                    isLoading
                    onChartReady={onChartReady}
                />,
                false,
            ),
        );
        expect(firstDom.isConnected).toBe(false);
        expect(resizeObservers.size).toBe(0);
        // An observation of the detached target delivered before cleanup ran
        act(() => {
            firstObserver.callback(
                [fakeResizeObserverEntry(firstDom, 0, 0)],
                firstObserver,
            );
        });
        expect(measuredWidths.at(-1)).toBe(640);

        view.rerender(
            wrap(
                <Chart results={results} onChartReady={onChartReady} />,
                false,
            ),
        );
        expect(ready).toHaveLength(2);
        const secondDom = ready[1].getDom();
        expect(secondDom).not.toBe(firstDom);
        expect([...resizeObservers].map((o) => [...o.targets])).toEqual([
            [secondDom],
        ]);
        resizeTarget(secondDom, 320, 200);
        expect(measuredWidths.at(-1)).toBe(320);
    });

    it('applies a zero width from a connected, hidden container', () => {
        const ready: LiveInstance[] = [];
        renderWithProviders(
            wrap(
                <Chart
                    results={makeResults(1)}
                    onChartReady={(instance) =>
                        ready.push(instance as LiveInstance)
                    }
                />,
                false,
            ),
        );
        const dom = ready[0].getDom();
        resizeTarget(dom, 640, 400);
        resizeTarget(dom, 0, 0);
        expect(measuredWidths.at(-1)).toBe(0);
    });
});
