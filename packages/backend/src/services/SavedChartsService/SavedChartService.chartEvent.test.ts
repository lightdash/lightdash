import {
    buildPopAdditionalMetric,
    CartesianSeriesType,
    ChartType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    TimeFrames,
    type AdditionalMetric,
    type CompiledDimension,
    type Explore,
    type MetricQuery,
    type SavedChartDAO,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { SavedChartService } from './SavedChartService';

const grantAudit = { viaDashboardGrant: false, grantOnly: false };

const dimension = (name: string, type: DimensionType): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
    compiledSql: '',
    tablesReferences: ['orders'],
});

const explore = {
    name: 'orders',
    tables: {
        orders: {
            dimensions: {
                order_date_day: dimension('order_date_day', DimensionType.DATE),
                created_at: dimension('created_at', DimensionType.TIMESTAMP),
                status: dimension('status', DimensionType.STRING),
            },
        },
    },
} as unknown as Explore;

const customMetric: AdditionalMetric = {
    table: 'orders',
    name: 'average_amount',
    label: 'Average amount',
    type: MetricType.AVERAGE,
    sql: '${TABLE}.amount',
};

const { additionalMetric: popMetric, metricId: popMetricId } =
    buildPopAdditionalMetric({
        metric: {
            table: 'orders',
            name: 'count',
            label: 'Count',
            description: undefined,
            type: MetricType.COUNT,
            sql: '${TABLE}.order_id',
            round: undefined,
            compact: undefined,
            format: undefined,
            formatOptions: undefined,
            distinctKeys: undefined,
        },
        timeDimensionId: 'orders_order_date_day',
        granularity: TimeFrames.DAY,
        periodOffset: 1,
    });

const baseMetricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_day'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const cartesianChart = (
    xField: string,
    metricQuery: MetricQuery = baseMetricQuery,
): SavedChartDAO =>
    ({
        uuid: 'chart-uuid',
        projectUuid: 'project-uuid',
        name: 'Orders over time',
        description: undefined,
        metricQuery,
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField, yField: ['orders_count'] },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.LINE,
                            encode: {
                                xRef: { field: xField },
                                yRef: { field: 'orders_count' },
                            },
                        },
                    ],
                },
            },
        },
        parameters: {},
    }) as SavedChartDAO;

describe('SavedChartService.getCreateEventProperties metric counts', () => {
    it('counts selected custom metrics and period-over-period metrics', () => {
        const properties = SavedChartService.getCreateEventProperties(
            cartesianChart('orders_order_date_day', {
                ...baseMetricQuery,
                metrics: ['orders_count', 'orders_average_amount', popMetricId],
                additionalMetrics: [customMetric, popMetric],
            }),
            grantAudit,
            explore,
        );

        expect(properties).toMatchObject({
            additionalMetricsCount: 2,
            periodOverPeriodMetricsCount: 1,
        });
    });

    it('ignores additional metrics that are not selected in the query', () => {
        const properties = SavedChartService.getCreateEventProperties(
            cartesianChart('orders_order_date_day', {
                ...baseMetricQuery,
                additionalMetrics: [customMetric, popMetric],
            }),
            grantAudit,
            explore,
        );

        expect(properties).toMatchObject({
            additionalMetricsCount: 0,
            periodOverPeriodMetricsCount: 0,
        });
    });

    it('reports zero when the chart has no additional metrics', () => {
        const properties = SavedChartService.getCreateEventProperties(
            cartesianChart('orders_order_date_day'),
            grantAudit,
            explore,
        );

        expect(properties).toMatchObject({
            additionalMetricsCount: 0,
            periodOverPeriodMetricsCount: 0,
        });
    });
});

describe('SavedChartService.getCreateEventProperties cartesian date x-axis', () => {
    it.each([
        ['orders_order_date_day', true],
        ['orders_created_at', true],
        ['orders_status', false],
        ['orders_count', false],
    ])('reports hasDateXAxis for x field %s as %s', (xField, expected) => {
        const properties = SavedChartService.getCreateEventProperties(
            cartesianChart(xField),
            grantAudit,
            explore,
        );

        expect(properties.cartesian).toMatchObject({ hasDateXAxis: expected });
    });

    it('reads the type of a custom SQL dimension on the x-axis', () => {
        const properties = SavedChartService.getCreateEventProperties(
            cartesianChart('order_week', {
                ...baseMetricQuery,
                customDimensions: [
                    {
                        id: 'order_week',
                        name: 'Order week',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: "date_trunc('week', ${orders.order_date})",
                        dimensionType: DimensionType.DATE,
                    },
                ],
            }),
            grantAudit,
            explore,
        );

        expect(properties.cartesian).toMatchObject({ hasDateXAxis: true });
    });

    it('reports false when the explore is not available', () => {
        const properties = SavedChartService.getCreateEventProperties(
            cartesianChart('orders_order_date_day'),
            grantAudit,
            undefined,
        );

        expect(properties.cartesian).toMatchObject({ hasDateXAxis: false });
    });

    it('preserves chart event properties when date x-axis metadata cannot be read', () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        const invalidExplore = {
            ...explore,
            tables: { orders: {} },
        } as unknown as Explore;

        try {
            const properties = SavedChartService.getCreateEventProperties(
                cartesianChart('orders_order_date_day'),
                grantAudit,
                invalidExplore,
            );

            expect(properties).toMatchObject({
                savedQueryId: 'chart-uuid',
                cartesian: { hasDateXAxis: false },
            });
            expect(warn).toHaveBeenCalledWith(
                'Unable to determine chart date x-axis for analytics',
                { chartUuid: 'chart-uuid', error: expect.any(Error) },
            );
        } finally {
            warn.mockRestore();
        }
    });

    it('omits the cartesian block for other chart types', () => {
        const properties = SavedChartService.getCreateEventProperties(
            {
                ...cartesianChart('orders_order_date_day'),
                chartConfig: { type: ChartType.TABLE, config: {} },
            },
            grantAudit,
            explore,
        );

        expect(properties.cartesian).toBeUndefined();
    });
});
