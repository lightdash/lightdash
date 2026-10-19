import {
    CustomDimensionType,
    DimensionType,
    MetricType,
    type TableCalculation,
} from './field';
import { hasCustomSql, type AdditionalMetric } from './metricQuery';
import { buildPopAdditionalMetric } from './periodOverPeriodComparison';
import { TimeFrames } from './timeFrames';

const metric: AdditionalMetric = {
    name: 'total',
    table: 'orders',
    type: MetricType.SUM,
    sql: '${orders.amount}',
};

describe('hasCustomSql', () => {
    it.each([
        { tableCalculations: [], customDimensions: [], additionalMetrics: [] },
        { tableCalculations: [] },
        {
            tableCalculations: [
                {
                    name: 'formula',
                    displayName: 'Formula',
                    formula: '1 + 1',
                } as TableCalculation,
            ],
        },
    ])(
        'does not count queries without SQL table calculations, SQL dimensions or custom metrics: %j',
        (query) => {
            expect(hasCustomSql(query)).toBe(false);
        },
    );

    it.each([
        {
            tableCalculations: [
                {
                    name: 'custom',
                    displayName: 'Custom',
                    sql: 'SELECT secret FROM private_table',
                },
            ],
        },
        {
            tableCalculations: [],
            customDimensions: [
                {
                    id: 'custom',
                    name: 'Custom',
                    table: 'orders',
                    type: CustomDimensionType.SQL as const,
                    dimensionType: DimensionType.STRING,
                    sql: 'SELECT secret FROM private_table',
                },
            ],
        },
        { tableCalculations: [], additionalMetrics: [metric] },
        {
            tableCalculations: [],
            additionalMetrics: [
                {
                    ...metric,
                    baseDimensionName: 'amount',
                    sql: 'SELECT secret FROM private_table',
                },
            ],
        },
        {
            tableCalculations: [],
            additionalMetrics: [
                {
                    ...metric,
                    baseMetricName: 'amount',
                    sql: '${orders.amount} * 2',
                },
            ],
        },
        {
            tableCalculations: [],
            additionalMetrics: [{ ...metric, baseDimensionName: 'amount' }],
        },
        {
            tableCalculations: [],
            additionalMetrics: [{ ...metric, baseMetricName: 'amount' }],
        },
        {
            tableCalculations: [],
            additionalMetrics: [
                { ...metric, sql: '', baseDimensionName: 'amount' },
            ],
        },
        {
            tableCalculations: [],
            additionalMetrics: [
                { ...metric, sql: '', baseMetricName: 'total' },
            ],
        },
        {
            tableCalculations: [],
            additionalMetrics: [
                buildPopAdditionalMetric({
                    metric: { ...metric, sql: '${TABLE}.amount' } as Parameters<
                        typeof buildPopAdditionalMetric
                    >[0]['metric'],
                    timeDimensionId: 'orders_created_at',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 1,
                }).additionalMetric,
            ],
        },
    ])(
        'counts SQL table calculations, SQL dimensions and every custom metric: %j',
        (query) => {
            expect(hasCustomSql(query)).toBe(true);
        },
    );
});
