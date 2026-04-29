import { buildPopAdditionalMetric } from '../types/periodOverPeriodComparison';
import { type CompiledTable } from '../types/explore';
import { CustomFormatType, MetricType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { convertAdditionalMetric } from './additionalMetrics';

const baseTable: CompiledTable = {
    name: 'orders',
    label: 'Orders',
    database: 'db',
    schema: 'schema',
    sqlTable: 'orders',
    dimensions: {},
    metrics: {},
    lineageGraph: {},
} as unknown as CompiledTable;

describe('convertAdditionalMetric — PoP formatOptions inheritance', () => {
    it('preserves formatOptions when converting a PoP additional metric', () => {
        const baseMetric = {
            table: 'orders',
            name: 'total_revenue',
            label: 'Revenue',
            description: 'Total revenue',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            formatOptions: {
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
            },
        };

        const { additionalMetric: pop } = buildPopAdditionalMetric({
            metric: baseMetric,
            timeDimensionId: 'orders_order_date_week',
            granularity: TimeFrames.WEEK,
            periodOffset: 1,
        });

        expect(pop.formatOptions).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
        });

        const result = convertAdditionalMetric({
            additionalMetric: pop,
            table: baseTable,
        });

        expect(result.formatOptions).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
        });
    });
});
