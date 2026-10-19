import { deriveDataAppVizPivotConfig } from '../../../../../pivot/deriveDataAppVizPivotConfig';
import {
    deriveDataAppVizPivotConfiguration,
    derivePivotConfigurationFromChart,
} from '../../../../../pivot/derivePivotConfigFromChart';
import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import { type DataAppVizField } from '../../../../apps/types';
import {
    type PersistedRunQueryPayload,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
} from '../../../schemas';
import { getWebAiChartConfig } from '../getWebAiChartConfig';
import { deriveAiChartPivotConfiguration } from './deriveAiChartPivotConfiguration';
import { getGroupByDimensions } from './getGroupByDimensions';

const fieldsMap = {
    orders_order_date: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        name: 'order_date',
        label: 'Order date',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    },
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    },
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    },
} as unknown as ItemsMap;

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date', 'orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [{ fieldId: 'orders_order_date', descending: false }],
    limit: 500,
    tableCalculations: [],
};

const builtinChartConfig: ToolRunQueryBuiltinChartConfig = {
    defaultVizType: 'bar',
    xAxisDimension: 'orders_order_date',
    yAxisMetrics: ['orders_count'],
    groupBy: null,
    xAxisType: null,
    stackBars: null,
    lineType: null,
    xAxisLabel: 'Order date',
    yAxisLabel: 'Count',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
};

const makeQueryTool = (
    chartConfig: Partial<ToolRunQueryBuiltinChartConfig> | null,
): ToolRunQueryArgsTransformed => ({
    title: 'Orders by status',
    description: 'Orders count by status over time',
    queryConfig: {
        exploreName: 'orders',
        dimensions: metricQuery.dimensions,
        metrics: metricQuery.metrics,
        sorts: [
            {
                fieldId: 'orders_order_date',
                descending: false,
                nullsFirst: null,
            },
        ],
        limit: 500,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
        filters: {},
    },
    chartConfig: chartConfig && { ...builtinChartConfig, ...chartConfig },
    mergeConfig: null,
});

const deriveBuiltin = (queryTool: ToolRunQueryArgsTransformed) =>
    deriveAiChartPivotConfiguration({
        source: { type: 'builtin', queryTool },
        metricQuery,
        fieldsMap,
    });

describe('deriveAiChartPivotConfiguration', () => {
    it('pivots a bar chart on its groupBy dimensions', () => {
        expect(
            deriveBuiltin(makeQueryTool({ groupBy: ['orders_status'] })),
        ).toEqual({
            indexColumn: [{ reference: 'orders_order_date', type: 'time' }],
            valuesColumns: [{ reference: 'orders_count', aggregation: 'any' }],
            groupByColumns: [{ reference: 'orders_status' }],
            sortBy: [
                {
                    reference: 'orders_order_date',
                    direction: 'ASC',
                },
            ],
        });
    });

    it('matches the agent derivation from the persisted viz config', () => {
        const queryTool = makeQueryTool({
            defaultVizType: 'line',
            groupBy: ['orders_status'],
        });
        const webAiChartConfig = getWebAiChartConfig({
            vizConfig: {
                ...queryTool,
                queryConfig: { ...queryTool.queryConfig, filters: null },
            } as PersistedRunQueryPayload,
            metricQuery,
            fieldsMap,
        });
        const previous = derivePivotConfigurationFromChart(
            {
                chartConfig: webAiChartConfig.echartsConfig,
                pivotConfig: {
                    columns: getGroupByDimensions(webAiChartConfig) ?? [],
                },
            },
            metricQuery,
            fieldsMap,
        );

        expect(previous).toBeDefined();
        expect(deriveBuiltin(queryTool)).toEqual(previous);
    });

    it('does not pivot a pie chart', () => {
        expect(
            deriveBuiltin(
                makeQueryTool({
                    defaultVizType: 'pie',
                    groupBy: ['orders_status'],
                }),
            ),
        ).toBeUndefined();
    });

    it('does not pivot without groupBy or chartConfig', () => {
        expect(deriveBuiltin(makeQueryTool({ groupBy: null }))).toBeUndefined();
        expect(deriveBuiltin(makeQueryTool({ groupBy: [] }))).toBeUndefined();
        expect(deriveBuiltin(makeQueryTool(null))).toBeUndefined();
    });

    it('does not pivot a custom chart type slug through the builtin source', () => {
        const queryTool: ToolRunQueryArgsTransformed = {
            ...makeQueryTool(null),
            chartConfig: {
                customChartTypeSlug: 'sankey',
                fieldMapping: { series: 'orders_status' },
                options: null,
            },
        };

        expect(deriveBuiltin(queryTool)).toBeUndefined();
    });

    it('pivots a custom chart type on its series slots', () => {
        const schemaFields: DataAppVizField[] = [
            { name: 'x', label: 'X', type: 'dimension', required: true },
            { name: 'series', label: 'Series', type: 'series', required: true },
            { name: 'value', label: 'Value', type: 'metric', required: true },
        ];
        const fieldMapping = {
            x: 'orders_order_date',
            series: 'orders_status',
            value: 'orders_count',
        };

        const derived = deriveAiChartPivotConfiguration({
            source: {
                type: 'customChartType',
                chart: { dataAppVizUuid: 'viz-uuid', fieldMapping },
                schemaFields,
            },
            metricQuery,
            fieldsMap,
        });

        expect(derived).toBeDefined();
        expect(derived).toEqual(
            deriveDataAppVizPivotConfiguration(
                fieldMapping,
                deriveDataAppVizPivotConfig(schemaFields, fieldMapping),
                metricQuery,
                fieldsMap,
            ),
        );
    });

    it('does not pivot a custom chart type with no mapped metric', () => {
        const schemaFields: DataAppVizField[] = [
            { name: 'x', label: 'X', type: 'dimension', required: true },
            { name: 'series', label: 'Series', type: 'series', required: true },
        ];
        const fieldMapping = {
            x: 'orders_order_date',
            series: 'orders_status',
        };

        expect(
            deriveAiChartPivotConfiguration({
                source: {
                    type: 'customChartType',
                    chart: { dataAppVizUuid: 'viz-uuid', fieldMapping },
                    schemaFields,
                },
                metricQuery,
                fieldsMap,
            }),
        ).toBeUndefined();
    });
});
