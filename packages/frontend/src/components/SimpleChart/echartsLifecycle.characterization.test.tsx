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
import { renderWithProviders } from '../../testing/testUtils';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';

/**
 * Characterization of main as of 2.631.5: how many ECharts instances, option
 * builds and setOption calls the cartesian chart costs. Values marked TODAY
 * are the behaviour a lifecycle fix is expected to change on purpose.
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
const makeRows = (scale: number) =>
    ['completed', 'shipped', 'returned'].map((status, i) => ({
        orders_status: cell(status),
        orders_revenue: cell((i + 1) * 100 * scale),
        orders_count: cell((i + 1) * scale),
    }));
const makeResults = (
    scale = 1,
): InfiniteQueryResults & { metricQuery: MetricQuery; fields: ItemsMap } => {
    const rows = makeRows(scale);
    return {
        queryUuid: `query-${scale}`,
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
};
const Chart = ({
    results,
    isLoading = false,
    isDashboard = false,
    containerWidth,
    onSeriesContextMenu,
    setEchartsRef,
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
        <SimpleChart isInDashboard={isDashboard} $shouldExpand />
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

    it('mounts through three instances because the config settles in effects (TODAY)', () => {
        renderWithProviders(wrap(<Chart results={makeResults(1)} />, false));
        expect(snapshot()).toMatchObject({
            init: 3,
            dispose: 2,
            setOption: 3,
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

    it('builds twice and re-creates the instance twice per results change (TODAY)', () => {
        const view = renderWithProviders(
            wrap(<Chart results={makeResults(1)} />, false),
        );
        takeChanged();
        const mounted = snapshot();
        view.rerender(wrap(<Chart results={makeResults(2)} />, false));
        expect(delta(mounted, snapshot())).toMatchObject({
            chartData: 2,
            init: 2,
            dispose: 2,
            setOption: 2,
            alive: 0,
        });
        // The first build pairs the new rows with the previous config
        expect(takeChanged()).toEqual([
            ['resultsData'],
            ['validCartesianConfig'],
        ]);
    });

    it('re-creates the instance on a legend toggle (TODAY)', async () => {
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
            init: 1,
            dispose: 1,
        });
    });

    it('strands the hover listeners when the instance is re-created without an option change (TODAY)', () => {
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
        // mouseover/mouseout stay bound to the disposed instance
        expect(delta(before, snapshot())).toMatchObject({
            option: 0,
            init: 1,
            listeners: -2,
        });
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
        const live = instances.filter((i) => !i.isDisposed());
        expect(live).toHaveLength(1);
        act(() => {
            (
                live[0] as unknown as {
                    trigger: (type: string, e: object) => void;
                }
            ).trigger('click', {
                componentType: 'series',
                seriesIndex: 0,
                dataIndex: 0,
                event: { event: new MouseEvent('click') },
            });
        });
        expect(received).toEqual([2]);
    });

    it('disposes the live chart when setEchartsRef changes identity (TODAY)', () => {
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
        expect(snapshot()).toMatchObject({ alive: 0, listeners: 0 });
        expect(refs.at(-1)?.current).toBeNull();
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
            expect(snapshot().alive).toBe(1);
            const beforeUnmount = snapshot();
            view.unmount();
            // The provider's own dispose finds the ref already detached
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
