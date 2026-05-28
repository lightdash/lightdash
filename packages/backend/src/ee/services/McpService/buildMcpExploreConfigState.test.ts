import {
    CartesianSeriesType,
    ChartType,
    toolRunQueryArgsSchemaTransformed,
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
            },
            chartConfig: {
                defaultVizType: 'bar',
                xAxisDimension: 'enrollments_campus',
                yAxisMetrics: ['enrollments_count'],
                groupBy: null,
                xAxisType: 'category',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'Campus',
                yAxisLabel: 'Enrollments',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            },
            filters: null,
        });

        const configState = buildMcpExploreConfigState({
            queryTool,
            metricQuery: {
                exploreName: 'enrollments',
                dimensions: ['enrollments_campus'],
                metrics: ['enrollments_count'],
                sorts: [],
                limit: 500,
                filters: queryTool.filters,
                additionalMetrics: [],
                tableCalculations: [],
            },
            fieldsMap: {},
            columnOrder: ['enrollments_campus', 'enrollments_count'],
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
            },
            filters: null,
        });

        const configState = buildMcpExploreConfigState({
            queryTool,
            metricQuery: {
                exploreName: 'enrollments',
                dimensions: ['enrollments_campus'],
                metrics: ['enrollments_count'],
                sorts: [],
                limit: 500,
                filters: queryTool.filters,
                additionalMetrics: [],
                tableCalculations: [],
            },
            fieldsMap: {},
            columnOrder: ['enrollments_campus', 'enrollments_count'],
        });

        expect(configState.chartConfig).toEqual({ type: ChartType.TABLE });
    });
});
