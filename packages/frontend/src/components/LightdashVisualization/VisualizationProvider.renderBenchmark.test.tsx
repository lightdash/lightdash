import {
    CartesianSeriesType,
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
import { act, cleanup } from '@testing-library/react';
import { appendFileSync } from 'node:fs';
import {
    memo,
    Profiler,
    useSyncExternalStore,
    type FC,
    type ProfilerOnRenderCallback,
    type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../features/explorer/store';
import {
    selectPieEditor,
    selectPieGroupFieldIds,
    selectPieMetricId,
    useVisualizationSelector,
} from '../../features/visualization/store';
import type useCartesianChartConfig from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import useEchartsCartesianConfig from '../../hooks/echarts/useEchartsCartesianConfig';
import useEchartsPieConfig from '../../hooks/echarts/useEchartsPieConfig';
import type useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import type usePieChartConfig from '../../hooks/usePieChartConfig';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { defaultState } from '../../providers/Explorer/defaultState';
import { renderWithProviders } from '../../testing/testUtils';
import {
    isCartesianVisualizationConfig,
    isPieVisualizationConfig,
    isTableVisualizationConfig,
} from './types';
import {
    useVisualizationConfig,
    useVisualizationContext,
    useVisualizationInputs,
    useVisualizationInputSelector,
    useVisualizationServices,
} from './useVisualizationContext';
import VisualizationProvider, {
    type VisualizationProviderProps,
} from './VisualizationProvider';

// Counts how many times each kind of consumer renders while a chart is
// edited in an explorer-like host. A rise is a performance regression;
// change the pins on purpose, never to make the test pass.

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const dimension = (name: string, label: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});
const metric = (name: string, label: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});

const fields: ItemsMap = {
    orders_order_date_month: dimension('order_date_month', 'Order month'),
    orders_status: dimension('status', 'Status'),
    orders_total: metric('total', 'Total'),
    orders_count: metric('count', 'Count'),
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_total', 'orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
const statuses = ['completed', 'shipped', 'returned'];
const resultsData: VisualizationProviderProps['resultsData'] = {
    queryUuid: 'query-uuid',
    queryStatus: QueryHistoryStatus.READY,
    rows: months.flatMap((month, i) =>
        statuses.map((status, j) => ({
            orders_order_date_month: {
                value: { raw: month, formatted: month },
            },
            orders_status: { value: { raw: status, formatted: status } },
            orders_total: {
                value: { raw: i * 10 + j, formatted: `${i * 10 + j}` },
            },
            orders_count: { value: { raw: i + j, formatted: `${i + j}` } },
        })),
    ),
    totalResults: months.length * statuses.length,
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
} satisfies InfiniteQueryResults & {
    metricQuery: MetricQuery;
    fields: ItemsMap;
};

const columnOrder = [
    'orders_order_date_month',
    'orders_status',
    'orders_total',
    'orders_count',
];

const cartesianConfig: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'orders_order_date_month',
            yField: ['orders_total', 'orders_count'],
        },
        eChartsConfig: {
            series: [
                {
                    encode: {
                        xRef: { field: 'orders_order_date_month' },
                        yRef: { field: 'orders_total' },
                    },
                    type: CartesianSeriesType.BAR,
                },
                {
                    encode: {
                        xRef: { field: 'orders_order_date_month' },
                        yRef: { field: 'orders_count' },
                    },
                    type: CartesianSeriesType.BAR,
                },
            ],
        },
    },
};

const pieConfig: ChartConfig = {
    type: ChartType.PIE,
    config: {
        groupFieldIds: ['orders_status'],
        metricId: 'orders_total',
        isDonut: true,
    },
};

// Hoisted like the app's memoised palette hook; a literal would change identity per host render
const colorPalette = ['#111111', '#222222', '#333333'];

const tableConfig: ChartConfig = {
    type: ChartType.TABLE,
    config: { showTableNames: true, columns: {} },
};

// ---------------------------------------------------------------------------
// Probes: each reads what one real consumer reads, nothing more
// ---------------------------------------------------------------------------

const counts: Record<string, number> = {};
const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
};
let actualDuration = 0;
const onRender: ProfilerOnRenderCallback = (_id, _phase, duration) => {
    actualDuration += duration;
};

let cartesian: ReturnType<typeof useCartesianChartConfig> | undefined;
let pie: ReturnType<typeof usePieChartConfig> | undefined;
let table: ReturnType<typeof useTableConfig> | undefined;

const useCartesian = () => {
    const visualizationConfig = useVisualizationConfig();
    return isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
};
const usePie = () => {
    const visualizationConfig = useVisualizationConfig();
    return isPieVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
};
const useTable = () => {
    const visualizationConfig = useVisualizationConfig();
    return isTableVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
};

// Consumers every chart type has
const ResultsOnlyProbe = memo(() => {
    useVisualizationInputs().resultsData;
    bump('resultsOnly');
    return null;
});
const ServicesOnlyProbe = memo(() => {
    useVisualizationServices();
    bump('servicesOnly');
    return null;
});
const WholeContextProbe = memo(() => {
    useVisualizationContext();
    bump('wholeContext');
    return null;
});

// Cartesian: chart body and the ChartConfigPanel sections
const CartesianBodyProbe = memo(() => {
    useEchartsCartesianConfig(undefined, false, 800);
    bump('chartBody');
    return null;
});
const CartesianLayoutPanelProbe = memo(() => {
    const config = useCartesian();
    cartesian = config;
    void config?.dirtyLayout;
    void config?.isStacked;
    bump('layoutPanel');
    return null;
});
const CartesianAxesPanelProbe = memo(() => {
    const config = useCartesian();
    void config?.dirtyEchartsConfig?.xAxis;
    void config?.dirtyEchartsConfig?.yAxis;
    bump('axesPanel');
    return null;
});
const CartesianSeriesPanelProbe = memo(() => {
    const config = useCartesian();
    void config?.dirtyEchartsConfig?.series;
    bump('seriesPanel');
    return null;
});
const CartesianLegendPanelProbe = memo(() => {
    const config = useCartesian();
    void config?.dirtyEchartsConfig?.legend;
    bump('legendPanel');
    return null;
});

// Pie: chart body and the three config tabs
const PieBodyProbe = memo(() => {
    useEchartsPieConfig(undefined, false);
    bump('chartBody');
    return null;
});
// Pie panels select the fields they show, like the real panels do
const PieLayoutPanelProbe = memo(() => {
    useVisualizationInputSelector(selectPieGroupFieldIds);
    useVisualizationInputSelector(selectPieMetricId);
    useVisualizationSelector((state) => selectPieEditor(state).isDonut);
    bump('layoutPanel');
    return null;
});
const PieDisplayPanelProbe = memo(() => {
    useVisualizationSelector((state) => selectPieEditor(state).showLegend);
    useVisualizationSelector((state) => selectPieEditor(state).legendPosition);
    bump('displayPanel');
    return null;
});
const PieSeriesPanelProbe = memo(() => {
    const config = usePie();
    pie = config;
    void config?.sortedGroupLabels;
    void config?.groupLabelOverrides;
    void config?.groupColorOverrides;
    bump('seriesPanel');
    return null;
});

// Table: the table body and the display tab
const TableBodyProbe = memo(() => {
    const config = useTable();
    table = config;
    void config?.columns;
    void config?.validConfig;
    bump('chartBody');
    return null;
});
const TableDisplayPanelProbe = memo(() => {
    const config = useTable();
    void config?.showTableNames;
    void config?.showRowCalculation;
    void config?.hideRowNumbers;
    bump('displayPanel');
    return null;
});

const sharedProbes = (
    <>
        <ResultsOnlyProbe />
        <ServicesOnlyProbe />
        <WholeContextProbe />
    </>
);
const cartesianProbes = (
    <>
        {sharedProbes}
        <CartesianBodyProbe />
        <CartesianLayoutPanelProbe />
        <CartesianAxesPanelProbe />
        <CartesianSeriesPanelProbe />
        <CartesianLegendPanelProbe />
    </>
);
const pieProbes = (
    <>
        {sharedProbes}
        <PieBodyProbe />
        <PieLayoutPanelProbe />
        <PieDisplayPanelProbe />
        <PieSeriesPanelProbe />
    </>
);
const tableProbes = (
    <>
        {sharedProbes}
        <TableBodyProbe />
        <TableDisplayPanelProbe />
    </>
);

// ---------------------------------------------------------------------------
// Host: the explorer store feedback loop the chart editor really runs in
// ---------------------------------------------------------------------------

const ExplorerHost: FC<{
    store: ReturnType<typeof createExplorerStore>;
    children: ReactNode;
}> = ({ store, children }) => {
    const chartConfig = useSyncExternalStore(
        store.subscribe,
        () => store.getState().explorer.unsavedChartVersion.chartConfig,
    );
    bump('host');
    return (
        <VisualizationProvider
            initialPivotDimensions={undefined}
            resultsData={resultsData}
            isLoading={false}
            columnOrder={columnOrder}
            colorPalette={colorPalette}
            chartConfig={chartConfig}
            onChartConfigChange={(c) =>
                store.dispatch(
                    explorerActions.setChartConfig({ chartConfig: c }),
                )
            }
            isEditMode
            containerWidth={800}
            containerHeight={400}
        >
            {children}
        </VisualizationProvider>
    );
};

const mount = (chartConfig: ChartConfig, probes: ReactNode) => {
    const store = createExplorerStore({
        explorer: buildInitialExplorerState({
            isEditMode: true,
            initialState: {
                unsavedChartVersion: {
                    ...defaultState.unsavedChartVersion,
                    tableName: 'orders',
                    metricQuery,
                    chartConfig,
                },
            },
        }),
    });
    let dispatches = 0;
    store.subscribe(() => {
        dispatches += 1;
    });
    renderWithProviders(
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                <Profiler id="benchmark" onRender={onRender}>
                    <ExplorerHost store={store}>{probes}</ExplorerHost>
                </Profiler>
            </ChartColorMappingContextProvider>
        </MemoryRouter>,
    );
    return { store, dispatches: () => dispatches };
};

const snapshotCounts = () => ({ ...counts });
const diffCounts = (before: Record<string, number>) =>
    Object.fromEntries(
        Object.keys(counts)
            .sort()
            .map((key) => [key, counts[key] - (before[key] ?? 0)]),
    );
const resetCounters = () => {
    Object.keys(counts).forEach((key) => {
        delete counts[key];
    });
    actualDuration = 0;
};

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
const waitForDebounce = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
    });

// Vitest hides stdout of passing tests; RENDER_BENCHMARK_OUT=<file> keeps the numbers
const report = (
    label: string,
    renders: Record<string, number>,
    extra: Record<string, number>,
) => {
    const line = `${label}: ${JSON.stringify({ ...renders, ...extra, durationMs: Math.round(actualDuration) })}`;
    if (process.env.RENDER_BENCHMARK_OUT) {
        appendFileSync(process.env.RENDER_BENCHMARK_OUT, `${line}\n`);
    }
};

describe('VisualizationProvider render benchmark', () => {
    afterEach(() => {
        cleanup();
        resetCounters();
        cartesian = undefined;
        pie = undefined;
        table = undefined;
    });

    it('cartesian: ten axis-name keystrokes, a legend toggle and a series edit', async () => {
        const { dispatches } = mount(cartesianConfig, cartesianProbes);
        await settle();
        const mountRenders = snapshotCounts();
        const mountDispatches = dispatches();
        report('cartesian mount', mountRenders, {
            dispatches: mountDispatches,
        });

        const before = snapshotCounts();
        for (let i = 1; i <= 10; i += 1) {
            act(() => {
                cartesian?.setXAxisName('Order month'.slice(0, i));
            });
        }
        await settle();
        const keystrokes = diffCounts(before);
        report('cartesian 10 keystrokes', keystrokes, {
            dispatches: dispatches() - mountDispatches,
        });

        const beforeLegend = snapshotCounts();
        act(() => cartesian?.setLegend({ show: false }));
        await settle();
        const legend = diffCounts(beforeLegend);
        report('cartesian legend toggle', legend, {});

        const beforeSeries = snapshotCounts();
        act(() => {
            cartesian?.updateSingleSeries({
                ...cartesian.dirtyEchartsConfig!.series![0],
                name: 'Renamed',
            });
        });
        await settle();
        const series = diffCounts(beforeSeries);
        report('cartesian series rename', series, {});

        expect({ keystrokes, legend, series }).toEqual({
            keystrokes: {
                axesPanel: 10,
                chartBody: 10,
                host: 10,
                layoutPanel: 10,
                legendPanel: 10,
                resultsOnly: 0,
                seriesPanel: 10,
                servicesOnly: 0,
                wholeContext: 10,
            },
            legend: {
                axesPanel: 1,
                chartBody: 1,
                host: 1,
                layoutPanel: 1,
                legendPanel: 1,
                resultsOnly: 0,
                seriesPanel: 1,
                servicesOnly: 0,
                wholeContext: 1,
            },
            series: {
                axesPanel: 1,
                chartBody: 1,
                host: 1,
                layoutPanel: 1,
                legendPanel: 1,
                resultsOnly: 0,
                seriesPanel: 1,
                servicesOnly: 0,
                wholeContext: 1,
            },
        });
    });

    it('pie: a donut toggle, ten label-override keystrokes and a legend toggle', async () => {
        const { dispatches } = mount(pieConfig, pieProbes);
        await settle();
        const mountRenders = snapshotCounts();
        const mountDispatches = dispatches();
        report('pie mount', mountRenders, { dispatches: mountDispatches });

        const beforeDonut = snapshotCounts();
        act(() => pie?.toggleDonut());
        await settle();
        const donut = diffCounts(beforeDonut);
        report('pie donut toggle', donut, {});

        const beforeLabels = snapshotCounts();
        const labelDispatches = dispatches();
        for (let i = 1; i <= 10; i += 1) {
            act(() =>
                pie?.groupLabelChange('completed', 'Completed!'.slice(0, i)),
            );
        }
        await settle();
        const keystrokes = diffCounts(beforeLabels);
        await waitForDebounce();
        const afterDebounce = diffCounts(beforeLabels);
        report('pie 10 label keystrokes', keystrokes, {});
        report('pie 10 label keystrokes + debounce', afterDebounce, {
            dispatches: dispatches() - labelDispatches,
        });

        const beforeLegend = snapshotCounts();
        act(() => pie?.toggleShowLegend());
        await settle();
        const legend = diffCounts(beforeLegend);
        report('pie legend toggle', legend, {});

        expect({ donut, keystrokes, afterDebounce, legend }).toEqual({
            donut: {
                chartBody: 2,
                displayPanel: 0,
                host: 1,
                layoutPanel: 1,
                resultsOnly: 0,
                seriesPanel: 1,
                servicesOnly: 0,
                wholeContext: 1,
            },
            keystrokes: {
                chartBody: 10,
                displayPanel: 0,
                host: 10,
                layoutPanel: 0,
                resultsOnly: 0,
                seriesPanel: 10,
                servicesOnly: 0,
                wholeContext: 10,
            },
            afterDebounce: {
                chartBody: 10,
                displayPanel: 0,
                host: 10,
                layoutPanel: 0,
                resultsOnly: 0,
                seriesPanel: 10,
                servicesOnly: 0,
                wholeContext: 10,
            },
            legend: {
                chartBody: 1,
                displayPanel: 1,
                host: 1,
                layoutPanel: 0,
                resultsOnly: 0,
                seriesPanel: 1,
                servicesOnly: 0,
                wholeContext: 1,
            },
        });
    });

    it('table: three display toggles and five column property edits', async () => {
        const { dispatches } = mount(tableConfig, tableProbes);
        await settle();
        const mountRenders = snapshotCounts();
        const mountDispatches = dispatches();
        report('table mount', mountRenders, { dispatches: mountDispatches });

        const beforeToggles = snapshotCounts();
        act(() => table?.setShowTableNames(false));
        act(() => table?.setShowRowCalculation(true));
        act(() => table?.setHideRowNumbers(true));
        await settle();
        const toggles = diffCounts(beforeToggles);
        report('table 3 toggles', toggles, {});

        const beforeColumns = snapshotCounts();
        for (let i = 1; i <= 5; i += 1) {
            act(() => {
                table?.updateColumnProperty('orders_total', {
                    name: 'Total'.slice(0, i),
                });
            });
        }
        await settle();
        const columns = diffCounts(beforeColumns);
        report('table 5 column edits', columns, {
            dispatches: dispatches() - mountDispatches,
        });

        expect({ toggles, columns }).toEqual({
            toggles: {
                chartBody: 3,
                displayPanel: 3,
                host: 3,
                resultsOnly: 0,
                servicesOnly: 0,
                wholeContext: 3,
            },
            columns: {
                chartBody: 5,
                displayPanel: 5,
                host: 5,
                resultsOnly: 0,
                servicesOnly: 0,
                wholeContext: 5,
            },
        });
    });
});
