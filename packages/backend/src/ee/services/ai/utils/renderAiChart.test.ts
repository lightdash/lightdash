import {
    DimensionType,
    FieldType,
    MetricType,
    type ChartBuilderInput,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
} from '@lightdash/common';
import { buildAiChart } from './renderAiChart';

const dimension = (name: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
});

const metric = (name: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
});

const fields: ItemsMap = {
    orders_status: dimension('status'),
    orders_region: dimension('region'),
    orders_revenue: metric('revenue'),
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_region'],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const rows = [
    { orders_status: 'completed', orders_region: 'US', orders_revenue: 100 },
    { orders_status: 'completed', orders_region: 'EU', orders_revenue: 200 },
    { orders_status: 'shipped', orders_region: 'US', orders_revenue: 300 },
];

const queryTool = (
    chartConfig: ChartBuilderInput['chartConfig'],
): ChartBuilderInput => ({
    title: 'Revenue by status',
    description: '',
    queryConfig: {
        dimensions: metricQuery.dimensions,
        metrics: metricQuery.metrics,
    },
    chartConfig,
});

const barConfig = {
    defaultVizType: 'bar' as const,
    xAxisDimension: 'orders_status',
    yAxisMetrics: ['orders_revenue'],
    groupBy: null,
    xAxisType: 'category' as const,
    stackBars: null,
    lineType: null,
    xAxisLabel: null,
    yAxisLabel: null,
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
};

describe('buildAiChart', () => {
    it('draws a bar chart as an ECharts option with one series per metric', () => {
        const rendered = buildAiChart({
            queryTool: queryTool(barConfig),
            metricQuery,
            rows,
            fields,
        });

        expect(rendered?.kind).toBe('echarts');
        if (rendered?.kind !== 'echarts') return;
        const series = rendered.option.series as {
            dimensions: { displayName: string }[];
        }[];
        expect(series.map((s) => s.dimensions[1].displayName)).toEqual([
            'revenue',
        ]);
    });

    it('pivots a grouped chart into one series per group value', () => {
        const rendered = buildAiChart({
            queryTool: queryTool({ ...barConfig, groupBy: ['orders_region'] }),
            metricQuery,
            rows,
            fields,
        });

        expect(rendered?.kind).toBe('echarts');
        if (rendered?.kind !== 'echarts') return;
        const series = rendered.option.series as {
            dimensions: { displayName: string }[];
            encode: { y: string };
        }[];
        expect(series.map((s) => s.encode.y)).toEqual([
            'orders_revenue_any_US',
            'orders_revenue_any_EU',
        ]);
        expect(series.map((s) => s.dimensions[1].displayName)).toEqual([
            'US',
            'EU',
        ]);
    });

    it('draws nothing for a table, a custom chart type or no rows', () => {
        expect(
            buildAiChart({
                queryTool: queryTool({ defaultVizType: 'table' }),
                metricQuery,
                rows,
                fields,
            }),
        ).toBeNull();
        expect(
            buildAiChart({
                queryTool: queryTool({
                    customChartTypeSlug: 'my-chart',
                } as unknown as ChartBuilderInput['chartConfig']),
                metricQuery,
                rows,
                fields,
            }),
        ).toBeNull();
        expect(
            buildAiChart({
                queryTool: queryTool(barConfig),
                metricQuery,
                rows: [],
                fields,
            }),
        ).toBeNull();
    });
});
