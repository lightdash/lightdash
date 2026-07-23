import { type ItemsMap } from '../../../../../../types/field';
import { toolRunQueryArgsSchemaTransformed } from '../../../../schemas/tools/toolRunQueryArgs';
import { getFunnelChartEchartsConfig } from './funnel';

const buildQueryTool = (dimensions: string[], metrics: string[]) =>
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
            defaultVizType: 'funnel',
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

const getSeriesData = (
    config: ReturnType<typeof getFunnelChartEchartsConfig>,
) => (config.series as { data: { name: string; value: number }[] }[])[0].data;

describe('getFunnelChartEchartsConfig', () => {
    it('builds one stage per metric for metrics-only single-row results', () => {
        const fieldsMap = {
            orders_stage_one: { fieldType: 'metric', label: 'Stage One' },
            orders_stage_two: { fieldType: 'metric', label: 'Stage Two' },
        } as unknown as ItemsMap;

        const config = getFunnelChartEchartsConfig(
            buildQueryTool(
                [],
                ['orders_stage_one', 'orders_stage_two', 'orders_stage_three'],
            ),
            [
                {
                    orders_stage_one: 100,
                    orders_stage_two: 60,
                    orders_stage_three: 20,
                },
            ],
            fieldsMap,
        );

        expect(getSeriesData(config)).toEqual([
            { name: 'Stage One', value: 100 },
            { name: 'Stage Two', value: 60 },
            // Falls back to the field id when the field is not in the map
            { name: 'orders_stage_three', value: 20 },
        ]);
    });

    it('builds one stage per row for dimension + metric results', () => {
        const config = getFunnelChartEchartsConfig(
            buildQueryTool(['orders_status'], ['orders_order_count']),
            [
                { orders_status: 'placed', orders_order_count: 100 },
                { orders_status: 'shipped', orders_order_count: 60 },
                { orders_status: 'completed', orders_order_count: 20 },
            ],
            {} as ItemsMap,
        );

        expect(getSeriesData(config)).toEqual([
            { name: 'placed', value: 100 },
            { name: 'shipped', value: 60 },
            { name: 'completed', value: 20 },
        ]);
    });
});
