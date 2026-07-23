import { type MetricQuery } from '../../../../../types/metricQuery';
import {
    ChartType,
    FunnelChartDataInput,
} from '../../../../../types/savedCharts';
import { toolRunQueryArgsSchemaTransformed } from '../../../schemas/tools/toolRunQueryArgs';
import { getRunQueryChartConfig } from './getRunQueryChartConfig';

const buildQueryTool = ({
    defaultVizType,
    dimensions,
    metrics,
}: {
    defaultVizType: 'funnel';
    dimensions: string[];
    metrics: string[];
}) =>
    toolRunQueryArgsSchemaTransformed.parse({
        title: 'Order Funnel',
        description: 'Order progression through stages',
        queryConfig: {
            exploreName: 'orders',
            dimensions,
            metrics,
            sorts: [],
            limit: 10,
            filters: null,
            customMetrics: null,
            tableCalculations: [],
        },
        chartConfig: {
            defaultVizType,
            xAxisDimension: dimensions[0] ?? null,
            yAxisMetrics: metrics,
            groupBy: null,
            xAxisType: null,
            stackBars: null,
            lineType: null,
            xAxisLabel: '',
            yAxisLabel: '',
            secondaryYAxisMetric: null,
            secondaryYAxisLabel: null,
        },
    });

const buildMetricQuery = (
    dimensions: string[],
    metrics: string[],
): MetricQuery => ({
    exploreName: 'orders',
    dimensions,
    metrics,
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
});

describe('getRunQueryChartConfig', () => {
    describe('funnel', () => {
        it('renders a metrics-only single-row query as a ROW funnel', () => {
            const metrics = [
                'orders_stage_one',
                'orders_stage_two',
                'orders_stage_three',
            ];
            const config = getRunQueryChartConfig({
                queryTool: buildQueryTool({
                    defaultVizType: 'funnel',
                    dimensions: [],
                    metrics,
                }),
                metricQuery: buildMetricQuery([], metrics),
                fieldsMap: {},
            });

            expect(config).toEqual({
                type: ChartType.FUNNEL,
                config: {
                    fieldId: 'orders_stage_one',
                    dataInput: FunnelChartDataInput.ROW,
                },
            });
        });

        it('renders a dimension + metric query as a COLUMN funnel', () => {
            const config = getRunQueryChartConfig({
                queryTool: buildQueryTool({
                    defaultVizType: 'funnel',
                    dimensions: ['orders_status'],
                    metrics: ['orders_order_count'],
                }),
                metricQuery: buildMetricQuery(
                    ['orders_status'],
                    ['orders_order_count'],
                ),
                fieldsMap: {},
            });

            expect(config).toEqual({
                type: ChartType.FUNNEL,
                config: {
                    fieldId: 'orders_order_count',
                    dataInput: FunnelChartDataInput.COLUMN,
                },
            });
        });
    });
});
