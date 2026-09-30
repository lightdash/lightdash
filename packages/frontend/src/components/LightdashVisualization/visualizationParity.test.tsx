import {
    ChartType,
    DimensionType,
    FieldType,
    FunnelChartDataInput,
    MetricType,
    QueryHistoryStatus,
    type ChartConfig,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
} from '@lightdash/common';
import {
    getGaugeSizes,
    renderChart,
    type RenderedChart,
} from '@lightdash/visualization';
import { cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useEchartsCartesianConfig from '../../hooks/echarts/useEchartsCartesianConfig';
import useEchartsFunnelConfig from '../../hooks/echarts/useEchartsFunnelConfig';
import useEchartsGaugeConfig from '../../hooks/echarts/useEchartsGaugeConfig';
import useEchartsPieConfig from '../../hooks/echarts/useEchartsPieConfig';
import useEchartsSankeyConfig from '../../hooks/echarts/useEchartsSankeyConfig';
import useEchartsTreemapConfig from '../../hooks/echarts/useEchartsTreemapConfig';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { useVisualizationTheme } from '../../hooks/useVisualizationTheme';
import { renderWithProviders } from '../../testing/testUtils';
import { useVisualizationContext } from './useVisualizationContext';
import VisualizationProvider from './VisualizationProvider';

/**
 * The web app and a headless caller draw the same chart: the option the
 * app's hooks build inside `VisualizationProvider` equals the one
 * `renderChart` builds from the saved chart alone. Functions (formatters)
 * are dropped from both sides by the JSON round trip; everything else, down
 * to colours and axis labels, must match.
 */

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

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

const metric = (name: string, label: string, format?: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
    ...(format ? { format: format as Metric['format'] } : {}),
});

const fields: ItemsMap = {
    orders_status: dimension('status', 'Status'),
    orders_channel: dimension('channel', 'Channel'),
    orders_revenue: metric('revenue', 'Revenue', 'usd'),
    orders_count: metric('count', 'Orders'),
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_channel'],
    metrics: ['orders_revenue', 'orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const cell = (raw: unknown, formatted: string) => ({
    value: { raw, formatted },
});

const rows = [
    {
        orders_status: cell('completed', 'completed'),
        orders_channel: cell('web', 'web'),
        orders_revenue: cell(1200.5, '$1,200.50'),
        orders_count: cell(12, '12'),
    },
    {
        orders_status: cell('shipped', 'shipped'),
        orders_channel: cell('web', 'web'),
        orders_revenue: cell(800, '$800.00'),
        orders_count: cell(8, '8'),
    },
    {
        orders_status: cell('returned', 'returned'),
        orders_channel: cell('store', 'store'),
        orders_revenue: cell(300, '$300.00'),
        orders_count: cell(3, '3'),
    },
];

const resultsData: InfiniteQueryResults & {
    metricQuery: MetricQuery;
    fields: ItemsMap;
} = {
    queryUuid: 'query-uuid',
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

const colorPalette = ['#111111', '#222222', '#333333'];
const columnOrder = [
    'orders_status',
    'orders_channel',
    'orders_revenue',
    'orders_count',
];
const SIZE = { width: 600, height: 400 };

/** The series a saved chart carries: the explorer saves them expanded. */
const savedSeries = (yFields: string[], type: 'bar' | 'line' = 'bar') =>
    yFields.map((yField) => ({
        type: type as never,
        encode: {
            xRef: { field: 'orders_status' },
            yRef: { field: yField },
        },
        yAxisIndex: 0,
    }));

/** What survives a JSON round trip: no functions, no undefined. */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));

/** The option the app's hook builds for the chart type in the context. */
const useAppOption = (type: ChartType) => {
    const cartesian = useEchartsCartesianConfig();
    const pie = useEchartsPieConfig();
    const funnel = useEchartsFunnelConfig();
    const treemap = useEchartsTreemapConfig(false);
    const gauge = useEchartsGaugeConfig({
        isInDashboard: false,
        ...getGaugeSizes(SIZE),
    });
    const sankey = useEchartsSankeyConfig(false);

    switch (type) {
        case ChartType.PIE:
            return pie?.eChartsOption;
        case ChartType.FUNNEL:
            return funnel;
        case ChartType.TREEMAP:
            return treemap?.eChartsOption;
        case ChartType.GAUGE:
            return gauge?.eChartsOption;
        case ChartType.SANKEY:
            return sankey;
        default:
            return cartesian;
    }
};

/** Renders the chart the app's way and the headless way, in the same theme. */
const Probe = ({ chartConfig }: { chartConfig: ChartConfig }) => {
    const appOption = useAppOption(chartConfig.type);
    const theme = useVisualizationTheme();
    // The same render options the app derives from its context.
    const { isTouchDevice, minimal, isDashboard } = useVisualizationContext();
    const headless: RenderedChart = renderChart({
        chartConfig,
        results: resultsData,
        itemsMap: fields,
        columnOrder,
        colorPalette,
        theme,
        size: SIZE,
        animation: !(isDashboard || minimal),
        tooltipAppendToBody: !isTouchDevice,
    });
    const headlessOption =
        headless.kind === 'echarts' ? headless.option : undefined;

    return (
        <div
            data-testid="probe"
            data-app={JSON.stringify(plain(appOption))}
            data-headless={JSON.stringify(plain(headlessOption))}
        />
    );
};

const renderBoth = (chartConfig: ChartConfig) => {
    renderWithProviders(
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                <VisualizationProvider
                    chartConfig={chartConfig}
                    initialPivotDimensions={undefined}
                    resultsData={resultsData}
                    isLoading={false}
                    columnOrder={columnOrder}
                    colorPalette={colorPalette}
                >
                    <Probe chartConfig={chartConfig} />
                </VisualizationProvider>
            </ChartColorMappingContextProvider>
        </MemoryRouter>,
    );
    const probe = screen.getByTestId('probe');
    return {
        app: JSON.parse(probe.getAttribute('data-app') ?? 'null'),
        headless: JSON.parse(probe.getAttribute('data-headless') ?? 'null'),
    };
};

describe('the app and the headless engine draw the same chart', () => {
    afterEach(() => {
        cleanup();
    });

    it('bar chart with two metrics', () => {
        const { app, headless } = renderBoth({
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_status',
                    yField: ['orders_revenue', 'orders_count'],
                },
                eChartsConfig: {
                    series: savedSeries(['orders_revenue', 'orders_count']),
                },
            },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });

    it('stacked horizontal bars with a legend', () => {
        const { app, headless } = renderBoth({
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_status',
                    yField: ['orders_revenue', 'orders_count'],
                    flipAxes: true,
                },
                eChartsConfig: {
                    series: savedSeries(['orders_revenue', 'orders_count']),
                    legend: { show: true, position: 'bottom' },
                },
            },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });

    it('funnel', () => {
        const { app, headless } = renderBoth({
            type: ChartType.FUNNEL,
            config: {
                fieldId: 'orders_revenue',
                dataInput: FunnelChartDataInput.ROW,
            },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });

    it('treemap', () => {
        const { app, headless } = renderBoth({
            type: ChartType.TREEMAP,
            config: {
                groupFieldIds: ['orders_status', 'orders_channel'],
                sizeMetricId: 'orders_revenue',
            },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });

    it('gauge', () => {
        const { app, headless } = renderBoth({
            type: ChartType.GAUGE,
            config: { selectedField: 'orders_revenue', min: 0, max: 5000 },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });

    it('sankey', () => {
        const { app, headless } = renderBoth({
            type: ChartType.SANKEY,
            config: {
                sourceFieldId: 'orders_status',
                targetFieldId: 'orders_channel',
                metricFieldId: 'orders_revenue',
            },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });

    it('donut', () => {
        const { app, headless } = renderBoth({
            type: ChartType.PIE,
            config: {
                groupFieldIds: ['orders_status'],
                metricId: 'orders_revenue',
                showPercentage: true,
                valueLabel: 'outside',
            },
        });

        expect(app).not.toBeNull();
        expect(headless).toEqual(app);
    });
});
