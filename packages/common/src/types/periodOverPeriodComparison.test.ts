import {
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
});
