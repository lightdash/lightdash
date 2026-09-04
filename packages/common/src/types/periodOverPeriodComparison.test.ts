import { MetricType, type Metric } from './field';
import {
    buildPopAdditionalMetric,
    getPopComparisonConfigKey,
    hashPopComparisonConfigKeyToSuffix,
} from './periodOverPeriodComparison';
import { TimeFrames } from './timeFrames';

describe('periodOverPeriodComparison helpers', () => {
    test('getPopComparisonConfigKey is deterministic for same inputs', () => {
        const a = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });
        const b = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });
        expect(a).toEqual(b);
    });

    test('getPopComparisonConfigKey changes when any field changes', () => {
        const base = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });

        expect(
            getPopComparisonConfigKey({
                timeDimensionId: 'orders_order_date_month',
                granularity: TimeFrames.MONTH,
                periodOffset: 2,
            }),
        ).not.toEqual(base);

        expect(
            getPopComparisonConfigKey({
                timeDimensionId: 'orders_order_date_week',
                granularity: TimeFrames.MONTH,
                periodOffset: 1,
            }),
        ).not.toEqual(base);

        expect(
            getPopComparisonConfigKey({
                timeDimensionId: 'orders_order_date_month',
                granularity: TimeFrames.WEEK,
                periodOffset: 1,
            }),
        ).not.toEqual(base);
    });

    test('hashPopComparisonConfigKeyToSuffix is deterministic and fixed length', () => {
        const key = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });

        const a = hashPopComparisonConfigKeyToSuffix(key);
        const b = hashPopComparisonConfigKeyToSuffix(key);

        expect(a).toEqual(b);
        expect(a).toHaveLength(8);
        expect(a).toMatch(/^[0-9a-z]{8}$/);
    });

    test('hashPopComparisonConfigKeyToSuffix differs for different config keys', () => {
        const k1 = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });
        const k2 = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 2,
        });
        expect(k1).not.toEqual(k2);
        expect(hashPopComparisonConfigKeyToSuffix(k1)).not.toEqual(
            hashPopComparisonConfigKeyToSuffix(k2),
        );
    });

    test('getPopComparisonConfigKey is delimiter-safe (timeDimensionId can contain "|")', () => {
        const normal = getPopComparisonConfigKey({
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });
        const withPipe = getPopComparisonConfigKey({
            timeDimensionId: 'orders|order_date|month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });
        expect(withPipe).not.toEqual(normal);
    });

    test('generated PoP metrics preserve sum_distinct keys', () => {
        const { additionalMetric } = buildPopAdditionalMetric({
            metric: {
                table: 'orders',
                name: 'deduplicated_revenue',
                label: 'Deduplicated revenue',
                type: MetricType.SUM_DISTINCT,
                sql: '${TABLE}.revenue',
                distinctKeys: ['orders.order_id', 'orders.payment_id'],
            } as Metric,
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });

        expect(additionalMetric.distinctKeys).toEqual([
            'orders.order_id',
            'orders.payment_id',
        ]);
    });

    test('generated to-date PoP metrics describe the matched elapsed period', () => {
        const { additionalMetric } = buildPopAdditionalMetric({
            metric: {
                table: 'orders',
                name: 'revenue',
                label: 'Revenue',
                type: MetricType.SUM,
                sql: '${TABLE}.revenue',
            } as Metric,
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
            comparisonMode: 'toDate',
        });

        expect(additionalMetric).toMatchObject({
            label: 'Revenue (Previous month to date)',
            comparisonMode: 'toDate',
        });
    });
});
