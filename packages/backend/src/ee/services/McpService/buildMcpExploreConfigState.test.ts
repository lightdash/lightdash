import {
    CartesianSeriesType,
    ChartType,
    isCustomChartTypeSlugChartConfig,
    toolRunQueryArgsSchemaTransformed,
    type DataAppVizSchema,
} from '@lightdash/common';
import { buildMcpExploreConfigState } from './buildMcpExploreConfigState';

describe('buildMcpExploreConfigState', () => {
    it('preserves the requested chart type in the saved chart state', () => {
        const queryTool = toolRunQueryArgsSchemaTransformed.parse({
            title: 'Enrollments by campus',
            description: 'Enrollment counts grouped by campus',
            queryConfig: {
                exploreName: 'enrollments',
                dimensions: ['enrollments_campus'],
                metrics: ['enrollments_count'],
                sorts: [],
                limit: 500,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
            chartConfig: {
                defaultVizType: 'bar',
                xAxisDimension: 'enrollments_campus',
                yAxisMetrics: ['enrollments_count'],
                groupBy: null,
                xAxisType: 'category',
                stackBars: null,
                lineType: null,
                xAxisLabel: 'Campus',
                yAxisLabel: 'Enrollments',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            },
        });

        const configState = buildMcpExploreConfigState({
            queryTool,
            metricQuery: {
                exploreName: 'enrollments',
                dimensions: ['enrollments_campus'],
                metrics: ['enrollments_count'],
                sorts: [],
                limit: 500,
                filters: queryTool.queryConfig.filters,
                additionalMetrics: [],
                tableCalculations: [],
            },
            fieldsMap: {},
            columnOrder: ['enrollments_campus', 'enrollments_count'],
            customChart: null,
        });

        expect(configState.chartConfig.type).toBe(ChartType.CARTESIAN);
        expect(configState.chartConfig).toMatchObject({
            config: {
                layout: {
                    xField: 'enrollments_campus',
                    yField: ['enrollments_count'],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: 'enrollments_campus' },
                                yRef: { field: 'enrollments_count' },
                            },
                        },
                    ],
                },
            },
        });
    });

    it('defaults to table state when no chart config is provided', () => {
        const queryTool = toolRunQueryArgsSchemaTransformed.parse({
            title: 'Enrollment rows',
            description: 'Enrollment rows by campus',
            queryConfig: {
                exploreName: 'enrollments',
                dimensions: ['enrollments_campus'],
                metrics: ['enrollments_count'],
                sorts: [],
                limit: 500,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
            chartConfig: null,
        });

        const configState = buildMcpExploreConfigState({
            queryTool,
            metricQuery: {
                exploreName: 'enrollments',
                dimensions: ['enrollments_campus'],
                metrics: ['enrollments_count'],
                sorts: [],
                limit: 500,
                filters: queryTool.queryConfig.filters,
                additionalMetrics: [],
                tableCalculations: [],
            },
            fieldsMap: {},
            columnOrder: ['enrollments_campus', 'enrollments_count'],
            customChart: null,
        });

        expect(configState.chartConfig).toEqual({
            type: ChartType.TABLE,
            config: { showTableNames: false },
        });
    });

    describe('with a custom chart type', () => {
        const customChartTypeFields: DataAppVizSchema['fields'] = [
            { name: 'date', label: 'Date', type: 'dimension', required: true },
            {
                name: 'category',
                label: 'Category',
                type: 'series',
                required: true,
            },
            { name: 'value', label: 'Value', type: 'metric', required: true },
        ];
        const metricQuery = {
            exploreName: 'orders',
            dimensions: ['orders_date', 'orders_status'],
            metrics: ['orders_count'],
            sorts: [],
            limit: 500,
            filters: {},
            additionalMetrics: [],
            tableCalculations: [],
        };
        const buildState = (options: Record<string, unknown> | null) => {
            const queryTool = toolRunQueryArgsSchemaTransformed.parse({
                title: 'Orders by status',
                description: 'Orders over time by status',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: ['orders_date', 'orders_status'],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: {
                    customChartTypeSlug: 'streamgraph',
                    fieldMapping: {
                        date: 'orders_date',
                        category: 'orders_status',
                        value: 'orders_count',
                    },
                    options,
                },
            });
            if (!isCustomChartTypeSlugChartConfig(queryTool.chartConfig)) {
                throw new Error('expected a custom chart type config');
            }
            return buildMcpExploreConfigState({
                queryTool,
                metricQuery,
                fieldsMap: {},
                columnOrder: ['orders_date', 'orders_status', 'orders_count'],
                customChart: {
                    config: queryTool.chartConfig,
                    chartType: {
                        dataAppVizUuid: '33333333-3333-4333-8333-333333333333',
                        dataAppVizVersion: 4,
                        fields: customChartTypeFields,
                    },
                },
            });
        };

        it('opens the chart type instead of a table', () => {
            const configState = buildState({ curved: false });

            expect(configState.chartConfig).toEqual({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: '33333333-3333-4333-8333-333333333333',
                    dataAppVizVersion: 4,
                    fieldMapping: {
                        date: 'orders_date',
                        category: 'orders_status',
                        value: 'orders_count',
                    },
                    optionValues: { curved: false },
                },
            });
            expect(configState.pivotConfig).toEqual({
                columns: ['orders_status'],
            });
        });

        it('leaves option values unset when the call passes none', () => {
            const configState = buildState(null);

            expect(configState.chartConfig).toMatchObject({
                type: ChartType.DATA_APP_VIZ,
                config: { optionValues: undefined },
            });
        });
    });
});
