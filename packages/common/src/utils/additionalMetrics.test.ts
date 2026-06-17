import { type CompiledTable } from '../types/explore';
import { CustomFormatType, DimensionType, MetricType } from '../types/field';
import { buildPopAdditionalMetric } from '../types/periodOverPeriodComparison';
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

describe('convertAdditionalMetric — baseDimensionType plumbing', () => {
    const tableWithDims = {
        ...baseTable,
        dimensions: {
            order_date: {
                name: 'order_date',
                type: DimensionType.DATE,
            },
            order_date_day: {
                name: 'order_date_day',
                type: DimensionType.DATE,
                timeInterval: TimeFrames.DAY,
            },
            amount: {
                name: 'amount',
                type: DimensionType.NUMBER,
            },
            created_at: {
                name: 'created_at',
                type: DimensionType.TIMESTAMP,
            },
        },
    } as unknown as CompiledTable;

    it('resolves baseDimensionType/Interval for a MIN/MAX over a day-grain DATE dimension', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'max_day',
                type: MetricType.MAX,
                sql: "DATE_TRUNC('DAY', ${TABLE}.order_date)",
                baseDimensionName: 'order_date_day',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toEqual(DimensionType.DATE);
        expect(result.baseDimensionTimeInterval).toEqual(TimeFrames.DAY);
    });

    it('leaves it undefined when there is no baseDimensionName (free-SQL custom metric)', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'max_expr',
                type: MetricType.MAX,
                sql: '${TABLE}.order_date',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toBeUndefined();
        expect(result.baseDimensionTimeInterval).toBeUndefined();
    });

    it('leaves it undefined for a non MIN/MAX metric', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'count_day',
                type: MetricType.COUNT_DISTINCT,
                sql: "DATE_TRUNC('DAY', ${TABLE}.order_date)",
                baseDimensionName: 'order_date_day',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toBeUndefined();
    });

    it('leaves it undefined for a non-temporal base (MAX over a number)', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'max_amount',
                type: MetricType.MAX,
                sql: '${TABLE}.amount',
                baseDimensionName: 'amount',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toBeUndefined();
    });

    it('records a TIMESTAMP base for a MIN/MAX over a TIMESTAMP dimension', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'min_created_at',
                type: MetricType.MIN,
                sql: '${TABLE}.created_at',
                baseDimensionName: 'created_at',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toEqual(DimensionType.TIMESTAMP);
        expect(result.baseDimensionTimeInterval).toBeUndefined();
    });
});
