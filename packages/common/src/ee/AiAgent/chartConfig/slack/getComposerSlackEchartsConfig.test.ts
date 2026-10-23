import { DimensionType } from '../../../../types/field';
import { type ResultColumn } from '../../../../types/results';
import { TimeFrames } from '../../../../types/timeFrames';
import { getComposerRunQueryChart } from '../../composerChartVizConfig';
import {
    composerChartVizConfigSchemaPersisted,
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
    type ToolRunQueryBuiltinChartConfig,
} from '../../schemas';
import { AiResultType } from '../../types';
import { getComposerSlackEchartsConfig } from './getComposerSlackEchartsConfig';
import { getSlackAiEchartsConfig } from './getSlackAiEchartsConfig';
import { type GetPivotedResultsFn } from './types';

const columns: ResultColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    { reference: 'status', type: DimensionType.STRING },
    { reference: 'revenue', type: DimensionType.NUMBER },
    { reference: 'order_count', type: DimensionType.NUMBER },
];

const rows = [
    {
        orders_month: '2024-01-01',
        status: 'done',
        revenue: 10,
        order_count: 2,
    },
    {
        orders_month: '2024-02-01',
        status: 'open',
        revenue: 20,
        order_count: 3,
    },
];

const viz = (
    config: Partial<ComposerBuiltinChartVizConfig> &
        Pick<ComposerBuiltinChartVizConfig, 'type'>,
): ComposerStoredChartVizConfig =>
    composerChartVizConfigSchemaPersisted.parse({
        x: null,
        y: null,
        groupBy: null,
        stack: null,
        horizontal: null,
        y2: null,
        labels: null,
        ...config,
    });

// Echoes its arguments so both paths must pivot the same rows the same way.
const getPivotedResults: GetPivotedResultsFn = async (
    pivotRows,
    fieldsMap,
    pivotFields,
    metrics,
    secondaryMetrics,
) => ({
    results: pivotRows,
    metrics: metrics.map((metric) => `${metric}__${pivotFields.join('_')}`),
    secondaryMetrics,
    labels: Object.fromEntries(
        [...metrics, ...secondaryMetrics].map((key) => [
            `${key}__${pivotFields.join('_')}`,
            `${Object.keys(fieldsMap).join(',')}`,
        ]),
    ),
});

// Axis formatters are fresh closures per call; compare the serializable config.
const serializable = (value: unknown) => JSON.parse(JSON.stringify(value));

const runQueryEcharts = async (
    vizConfig: ComposerStoredChartVizConfig,
    queryConfig: { dimensions: string[]; metrics: string[] },
    chartConfig: Partial<ToolRunQueryBuiltinChartConfig> &
        Pick<ToolRunQueryBuiltinChartConfig, 'defaultVizType'>,
    runQueryRows: Record<string, unknown>[],
) =>
    serializable(
        await getSlackAiEchartsConfig({
            toolArgs: {
                type: AiResultType.QUERY_RESULT,
                tool: {
                    title: 'Revenue',
                    description: 'Revenue chart',
                    queryConfig: {
                        exploreName: 'composer_result',
                        ...queryConfig,
                        sorts: [],
                        limit: null,
                        parameters: null,
                        customMetrics: null,
                        tableCalculations: null,
                        filters: {},
                    },
                    chartConfig: {
                        xAxisDimension: null,
                        yAxisMetrics: null,
                        groupBy: null,
                        xAxisType: null,
                        stackBars: null,
                        lineType: null,
                        xAxisLabel: '',
                        yAxisLabel: '',
                        secondaryYAxisMetric: null,
                        secondaryYAxisLabel: null,
                        ...chartConfig,
                    },
                    mergeConfig: null,
                },
            },
            queryResults: {
                rows: runQueryRows,
                fields: getComposerRunQueryChart({
                    columns,
                    vizConfig,
                    metadata: {
                        title: 'Revenue',
                        description: 'Revenue chart',
                    },
                    customChartTypeSlots: [],
                }).fields,
            },
            getPivotedResults,
        }),
    );

const composerEcharts = async (vizConfig: ComposerStoredChartVizConfig) =>
    serializable(
        await getComposerSlackEchartsConfig({
            columns,
            rows,
            vizConfig,
            metadata: { title: 'Revenue', description: 'Revenue chart' },
            getPivotedResults,
        }),
    );

const statusRevenueRows = [
    { composer_result_status: 'done', composer_result_revenue: 10 },
    { composer_result_status: 'open', composer_result_revenue: 20 },
];

describe('getComposerSlackEchartsConfig', () => {
    test('stacked bar matches runQuery', async () => {
        const vizConfig = viz({
            type: 'bar',
            x: 'status',
            y: ['revenue'],
            stack: true,
            labels: { x: 'Status', y: 'Revenue', y2: null },
        });
        expect(await composerEcharts(vizConfig)).toEqual(
            await runQueryEcharts(
                vizConfig,
                {
                    dimensions: ['composer_result_status'],
                    metrics: ['composer_result_revenue'],
                },
                {
                    defaultVizType: 'bar',
                    xAxisDimension: 'composer_result_status',
                    yAxisMetrics: ['composer_result_revenue'],
                    xAxisType: 'category',
                    stackBars: true,
                    xAxisLabel: 'Status',
                    yAxisLabel: 'Revenue',
                },
                statusRevenueRows,
            ),
        );
    });

    test('horizontal bar matches runQuery', async () => {
        const vizConfig = viz({
            type: 'bar',
            x: 'status',
            y: ['revenue'],
            horizontal: true,
        });
        expect(await composerEcharts(vizConfig)).toEqual(
            await runQueryEcharts(
                vizConfig,
                {
                    dimensions: ['composer_result_status'],
                    metrics: ['composer_result_revenue'],
                },
                {
                    defaultVizType: 'horizontal',
                    xAxisDimension: 'composer_result_status',
                    yAxisMetrics: ['composer_result_revenue'],
                    xAxisType: 'category',
                },
                statusRevenueRows,
            ),
        );
    });

    test('line split by status with a secondary axis matches runQuery', async () => {
        const vizConfig = viz({
            type: 'line',
            x: 'orders_month',
            y: ['revenue'],
            groupBy: ['status'],
            y2: 'order_count',
        });
        expect(await composerEcharts(vizConfig)).toEqual(
            await runQueryEcharts(
                vizConfig,
                {
                    dimensions: [
                        'composer_result_orders_month',
                        'composer_result_status',
                    ],
                    metrics: [
                        'composer_result_revenue',
                        'composer_result_order_count',
                    ],
                },
                {
                    defaultVizType: 'line',
                    xAxisDimension: 'composer_result_orders_month',
                    yAxisMetrics: ['composer_result_revenue'],
                    groupBy: ['composer_result_status'],
                    xAxisType: 'time',
                    secondaryYAxisMetric: 'composer_result_order_count',
                },
                rows.map((row) => ({
                    composer_result_orders_month: row.orders_month,
                    composer_result_status: row.status,
                    composer_result_revenue: row.revenue,
                    composer_result_order_count: row.order_count,
                })),
            ),
        );
    });

    test('area matches a runQuery area line', async () => {
        const vizConfig = viz({
            type: 'area',
            x: 'orders_month',
            y: ['revenue'],
        });
        const echarts = await composerEcharts(vizConfig);
        expect(echarts).toEqual(
            await runQueryEcharts(
                vizConfig,
                {
                    dimensions: ['composer_result_orders_month'],
                    metrics: ['composer_result_revenue'],
                },
                {
                    defaultVizType: 'line',
                    xAxisDimension: 'composer_result_orders_month',
                    yAxisMetrics: ['composer_result_revenue'],
                    xAxisType: 'time',
                    lineType: 'area',
                },
                rows.map((row) => ({
                    composer_result_orders_month: row.orders_month,
                    composer_result_revenue: row.revenue,
                })),
            ),
        );
        expect(echarts?.series).toEqual([
            expect.objectContaining({ type: 'line', areaStyle: {} }),
        ]);
    });

    test.each([
        ['scatter', 'scatter'],
        ['pie', 'pie'],
        ['funnel', 'funnel'],
    ] as const)('%s matches runQuery', async (type, defaultVizType) => {
        const vizConfig = viz({ type, x: 'status', y: ['revenue'] });
        expect(await composerEcharts(vizConfig)).toEqual(
            await runQueryEcharts(
                vizConfig,
                {
                    dimensions: ['composer_result_status'],
                    metrics: ['composer_result_revenue'],
                },
                {
                    defaultVizType,
                    xAxisDimension: 'composer_result_status',
                    yAxisMetrics: ['composer_result_revenue'],
                    xAxisType: 'category',
                },
                statusRevenueRows,
            ),
        );
    });

    test('table, big number and custom types have no image', async () => {
        expect(await composerEcharts(viz({ type: 'table' }))).toBeNull();
        expect(
            await composerEcharts(viz({ type: 'big_number', y: ['revenue'] })),
        ).toBeNull();
        expect(
            await composerEcharts({
                type: 'custom',
                customChartTypeSlug: 'ribbon',
                fieldMapping: { x: 'status', values: ['revenue'] },
                options: null,
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 3,
            }),
        ).toBeNull();
    });

    test('an empty result has no image', async () => {
        expect(
            await getComposerSlackEchartsConfig({
                columns,
                rows: [],
                vizConfig: viz({ type: 'bar', x: 'status', y: ['revenue'] }),
                metadata: { title: 'Revenue', description: 'Revenue chart' },
                getPivotedResults,
            }),
        ).toBeNull();
    });
});
