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
    Profiler,
    useCallback,
    type FC,
    type ProfilerOnRenderCallback,
    type ReactNode,
} from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LightdashVisualization from '.';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    useExplorerSelector,
} from '../../features/explorer/store';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { defaultState } from '../../providers/Explorer/defaultState';
import { renderWithProviders } from '../../testing/testUtils';
import { Axes } from '../VisualizationConfigs/ChartConfigPanel/Axes';
import { Grid } from '../VisualizationConfigs/ChartConfigPanel/Grid';
import { Layout as CartesianLayout } from '../VisualizationConfigs/ChartConfigPanel/Layout';
import { Legend } from '../VisualizationConfigs/ChartConfigPanel/Legend';
import { Series as CartesianSeries } from '../VisualizationConfigs/ChartConfigPanel/Series';
import { Display as PieDisplay } from '../VisualizationConfigs/PieChartConfig/PieChartDisplayConfig';
import { Layout as PieLayout } from '../VisualizationConfigs/PieChartConfig/PieChartLayoutConfig';
import { Series as PieSeries } from '../VisualizationConfigs/PieChartConfig/PieChartSeriesConfig';
import { ColumnCellDisplay } from '../VisualizationConfigs/TableConfigPanel/ColumnCellDisplay';
import ConditionalFormattingList from '../VisualizationConfigs/TableConfigPanel/ConditionalFormattingList';
import GeneralSettings from '../VisualizationConfigs/TableConfigPanel/GeneralSettings';
import {
    isCartesianVisualizationConfig,
    isPieVisualizationConfig,
    isTableVisualizationConfig,
    type VisualizationConfig,
} from './types';
import { useVisualizationContext } from './useVisualizationContext';
import VisualizationProvider, {
    type VisualizationProviderProps,
} from './VisualizationProvider';

// Commits of the real chart body and the real config panels, each wrapped in a
// Profiler, while a chart is edited in an explorer-store host. Only imports
// main also has, so the same file runs on both trees. A rise is a performance
// regression; change the pins on purpose, never to make the test pass.

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

// The Display tab lazy-loads the tooltip editor; jsdom can't load monaco
vi.mock('../MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
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
// What ConfigTabs passes the cartesian panels, hoisted so its identity is stable like ConfigTabs' useMemo
const items = Object.values(fields);

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
// Hoisted like the app's memoised palette hook; a literal would change identity per host render
const colorPalette = ['#111111', '#222222', '#333333'];

const cartesianConfig: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'orders_order_date_month',
            yField: ['orders_total', 'orders_count'],
        },
        eChartsConfig: {
            series: ['orders_total', 'orders_count'].map((yField) => ({
                encode: {
                    xRef: { field: 'orders_order_date_month' },
                    yRef: { field: yField },
                },
                type: CartesianSeriesType.BAR,
            })),
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
const tableConfig: ChartConfig = {
    type: ChartType.TABLE,
    config: { showTableNames: true, columns: {} },
};

// ---------------------------------------------------------------------------
// Host: the explorer store feedback loop the chart editor runs in
// ---------------------------------------------------------------------------

type ExplorerStore = ReturnType<typeof createExplorerStore>;

const ExplorerHost: FC<{ store: ExplorerStore; children: ReactNode }> = ({
    store,
    children,
}) => {
    const chartConfig = useExplorerSelector(
        (state) => state.explorer.unsavedChartVersion.chartConfig,
    );
    const onChartConfigChange = useCallback(
        (c: ChartConfig) =>
            store.dispatch(explorerActions.setChartConfig({ chartConfig: c })),
        [store],
    );
    return (
        <VisualizationProvider
            initialPivotDimensions={undefined}
            resultsData={resultsData}
            isLoading={false}
            columnOrder={columnOrder}
            colorPalette={colorPalette}
            chartConfig={chartConfig}
            onChartConfigChange={onChartConfigChange}
            isEditMode
            containerWidth={800}
            containerHeight={400}
        >
            {children}
        </VisualizationProvider>
    );
};

// Edits go through the chart config aggregate, the one edit path main and the PR share
let visualizationConfig: VisualizationConfig | undefined;
const EditDriver: FC = () => {
    visualizationConfig = useVisualizationContext().visualizationConfig;
    return null;
};

const commits = { body: 0, panel: 0 };
const onRender: ProfilerOnRenderCallback = (id) => {
    commits[id as keyof typeof commits] += 1;
};

const mount = (chartConfig: ChartConfig, panel: ReactNode) => {
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
            <Provider store={store}>
                <ChartColorMappingContextProvider>
                    <ExplorerHost store={store}>
                        <EditDriver />
                        {/* A Profiler that bails out checks child work before React propagates context; a host parent propagates first */}
                        <div>
                            <Profiler id="body" onRender={onRender}>
                                <LightdashVisualization />
                            </Profiler>
                        </div>
                        <div>
                            <Profiler id="panel" onRender={onRender}>
                                {panel}
                            </Profiler>
                        </div>
                    </ExplorerHost>
                </ChartColorMappingContextProvider>
            </Provider>
        </MemoryRouter>,
    );
    return { dispatches: () => dispatches };
};

// Waits until 600ms pass with no commit (main debounces at 500ms), so a slow runner can't leak mount work into the edits
const settle = async () => {
    for (let round = 0; round < 10; round += 1) {
        const before = commits.body + commits.panel;
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 600));
        });
        if (commits.body + commits.panel === before) return;
    }
};

type Run = {
    mount: { body: number; panel: number };
    edits: { body: number; panel: number; explorerDispatches: number };
};

const run = async (
    chartConfig: ChartConfig,
    panel: ReactNode,
    edits: (() => void)[],
): Promise<Run> => {
    const { dispatches } = mount(chartConfig, panel);
    await settle();
    const mounted = { ...commits };
    const dispatchesBefore = dispatches();
    for (const edit of edits) {
        act(edit);
    }
    await settle();
    return {
        mount: mounted,
        edits: {
            body: commits.body - mounted.body,
            panel: commits.panel - mounted.panel,
            explorerDispatches: dispatches() - dispatchesBefore,
        },
    };
};

// Vitest hides stdout of passing tests; RENDER_BENCHMARK_OUT=<file> keeps the numbers
const report = (label: string, result: Run) => {
    if (process.env.RENDER_BENCHMARK_OUT) {
        appendFileSync(
            process.env.RENDER_BENCHMARK_OUT,
            `${JSON.stringify({ label, ...result })}\n`,
        );
    }
};

const keystrokes = (text: string) =>
    Array.from({ length: text.length }, (_, i) => text.slice(0, i + 1));

const cartesianEdits = keystrokes('Order date').map((name) => () => {
    if (!isCartesianVisualizationConfig(visualizationConfig))
        throw new Error('not cartesian');
    visualizationConfig.chartConfig.setXAxisName(name);
});
const pieEdits = keystrokes('Completed!').map((label) => () => {
    if (!isPieVisualizationConfig(visualizationConfig))
        throw new Error('not pie');
    visualizationConfig.chartConfig.groupLabelChange('completed', label);
});
const tableEdits = keystrokes('Sales').map((name) => () => {
    if (!isTableVisualizationConfig(visualizationConfig))
        throw new Error('not table');
    visualizationConfig.chartConfig.updateColumnProperty('orders_total', {
        name,
    });
});

// Pinned on this branch; main fails these pins, run it with RENDER_BENCHMARK_OUT to compare
const scenarios: {
    label: string;
    chartConfig: ChartConfig;
    edits: (() => void)[];
    panels: { name: string; element: ReactNode; pinned: Run }[];
}[] = [
    {
        label: 'cartesian, 10 x-axis name edits',
        chartConfig: cartesianConfig,
        edits: cartesianEdits,
        panels: [
            {
                name: 'Layout',
                element: <CartesianLayout items={items} />,
                pinned: {
                    mount: { body: 2, panel: 7 },
                    edits: { body: 10, panel: 0, explorerDispatches: 10 },
                },
            },
            {
                name: 'Series',
                element: <CartesianSeries items={items} />,
                pinned: {
                    mount: { body: 2, panel: 10 },
                    edits: { body: 10, panel: 10, explorerDispatches: 10 },
                },
            },
            {
                name: 'Axes',
                element: <Axes itemsMap={fields} />,
                pinned: {
                    mount: { body: 2, panel: 5 },
                    edits: { body: 10, panel: 10, explorerDispatches: 10 },
                },
            },
            {
                name: 'Display',
                element: <Legend items={items} />,
                pinned: {
                    mount: { body: 2, panel: 5 },
                    edits: { body: 10, panel: 0, explorerDispatches: 10 },
                },
            },
            {
                name: 'Margins',
                element: <Grid />,
                pinned: {
                    mount: { body: 2, panel: 2 },
                    edits: { body: 10, panel: 0, explorerDispatches: 10 },
                },
            },
        ],
    },
    {
        label: 'pie, 10 label edits',
        chartConfig: pieConfig,
        edits: pieEdits,
        panels: [
            {
                name: 'Layout',
                element: <PieLayout />,
                pinned: {
                    mount: { body: 1, panel: 6 },
                    edits: { body: 11, panel: 0, explorerDispatches: 10 },
                },
            },
            {
                name: 'Series',
                element: <PieSeries />,
                pinned: {
                    mount: { body: 1, panel: 6 },
                    edits: { body: 11, panel: 20, explorerDispatches: 10 },
                },
            },
            {
                name: 'Display',
                element: <PieDisplay />,
                pinned: {
                    mount: { body: 1, panel: 4 },
                    edits: { body: 11, panel: 0, explorerDispatches: 10 },
                },
            },
        ],
    },
    {
        label: 'table, 5 column rename edits',
        chartConfig: tableConfig,
        edits: tableEdits,
        panels: [
            {
                name: 'General',
                element: <GeneralSettings />,
                pinned: {
                    mount: { body: 2, panel: 2 },
                    edits: { body: 10, panel: 5, explorerDispatches: 5 },
                },
            },
            {
                name: 'Conditional formatting',
                element: <ConditionalFormattingList />,
                pinned: {
                    mount: { body: 2, panel: 2 },
                    edits: { body: 10, panel: 0, explorerDispatches: 5 },
                },
            },
            {
                name: 'Cell display',
                element: <ColumnCellDisplay />,
                pinned: {
                    mount: { body: 2, panel: 2 },
                    edits: { body: 10, panel: 5, explorerDispatches: 5 },
                },
            },
        ],
    },
];

describe('VisualizationProvider render benchmark', () => {
    afterEach(() => {
        cleanup();
        commits.body = 0;
        commits.panel = 0;
        visualizationConfig = undefined;
    });

    describe.each(scenarios)(
        '$label',
        ({ label, chartConfig, edits, panels }) => {
            it.each(panels)(
                'chart body and the $name tab',
                async ({ name, element, pinned }) => {
                    const result = await run(chartConfig, element, edits);
                    report(`${label} / ${name}`, result);
                    expect(result.edits).toEqual(pinned.edits);
                    // A tab's mount commits depend on async timing (CI differs by one), so only the body's are pinned
                    expect(result.mount.body).toBe(pinned.mount.body);
                },
            );
        },
    );
});
