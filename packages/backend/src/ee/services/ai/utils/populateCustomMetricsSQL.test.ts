import { type PeriodComparisonCustomMetric } from '@lightdash/ai';
import {
    getItemId,
    isPeriodOverPeriodAdditionalMetric,
    MetricType,
    TimeFrames,
    type AdditionalMetric,
} from '@lightdash/common';
import {
    expandMetricsWithPopAdditionalMetrics,
    getPopMetricIdsByBaseMetricId,
    populateCustomMetricsSQL,
} from './populateCustomMetricsSQL';
import { mockOrdersExplore } from './validationExplore.mock';

const baseCustomMetric: AdditionalMetric = {
    table: 'orders',
    name: 'high_value_order_count',
    label: 'High value order count',
    type: MetricType.COUNT,
    sql: '${TABLE}.order_id',
    baseDimensionName: 'order_id',
};

describe('populateCustomMetricsSQL', () => {
    it('returns empty when customMetrics is null', () => {
        const result = populateCustomMetricsSQL(null, mockOrdersExplore);
        expect(result).toEqual([]);
    });

    it('returns empty when customMetrics is an empty array', () => {
        const result = populateCustomMetricsSQL([], mockOrdersExplore);
        expect(result).toEqual([]);
    });

    it('builds a PoP additional metric for a real base metric', () => {
        const pc: PeriodComparisonCustomMetric = {
            kind: 'periodComparison',
            baseMetricId: 'orders_total_revenue',
            timeDimensionId: 'orders_order_date',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        };
        const result = populateCustomMetricsSQL([pc], mockOrdersExplore);

        expect(result).toHaveLength(1);
        const pop = result[0]!;
        expect(isPeriodOverPeriodAdditionalMetric(pop)).toBe(true);
        expect(pop.table).toBe('orders');
        expect(pop.baseMetricId).toBe('orders_total_revenue');
        expect(pop.granularity).toBe(TimeFrames.MONTH);
        expect(pop.periodOffset).toBe(1);
        expect(pop.sql).toBe('SUM(${TABLE}.amount)');

        const ids = getPopMetricIdsByBaseMetricId(result).get(
            'orders_total_revenue',
        );
        expect(ids).toHaveLength(1);
        expect(ids![0]!).toBe(`orders_${pop.name}`);
    });

    it('builds a PoP additional metric for a custom base metric', () => {
        const pc: PeriodComparisonCustomMetric = {
            kind: 'periodComparison',
            baseMetricId: 'orders_high_value_order_count',
            timeDimensionId: 'orders_order_date',
            granularity: TimeFrames.WEEK,
            periodOffset: 2,
        };
        const result = populateCustomMetricsSQL(
            [baseCustomMetric, pc],
            mockOrdersExplore,
        );

        expect(result).toHaveLength(2);
        const pop = result[1]!;
        expect(pop.baseMetricId).toBe('orders_high_value_order_count');
        expect(pop.sql).toBe('${TABLE}.order_id');
        expect(pop.granularity).toBe(TimeFrames.WEEK);
        expect(pop.periodOffset).toBe(2);
    });

    it('dedupes identical (base, dim, granularity, offset) tuples', () => {
        const pc: PeriodComparisonCustomMetric = {
            kind: 'periodComparison',
            baseMetricId: 'orders_total_revenue',
            timeDimensionId: 'orders_order_date',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        };
        const result = populateCustomMetricsSQL([pc, pc], mockOrdersExplore);

        expect(result).toHaveLength(1);
        expect(
            getPopMetricIdsByBaseMetricId(result).get('orders_total_revenue'),
        ).toHaveLength(1);
    });

    it('keeps distinct entries with different granularity or offset', () => {
        const result = populateCustomMetricsSQL(
            [
                {
                    kind: 'periodComparison',
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 1,
                },
                {
                    kind: 'periodComparison',
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.YEAR,
                    periodOffset: 1,
                },
                {
                    kind: 'periodComparison',
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 12,
                },
            ],
            mockOrdersExplore,
        );

        expect(result).toHaveLength(3);
        expect(
            getPopMetricIdsByBaseMetricId(result).get('orders_total_revenue'),
        ).toHaveLength(3);
    });

    it('expands generated PoP metric ids next to their base metric', () => {
        const additionalMetrics = populateCustomMetricsSQL(
            [
                {
                    kind: 'periodComparison',
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 1,
                },
            ],
            mockOrdersExplore,
        );

        const expanded = expandMetricsWithPopAdditionalMetrics(
            ['orders_total_revenue', 'orders_order_count'],
            additionalMetrics,
        );

        expect(expanded[0]).toBe('orders_total_revenue');
        expect(expanded[1]).toBe(getItemId(additionalMetrics[0]!));
        expect(expanded[2]).toBe('orders_order_count');
    });

    it('throws AiAgentValidatorError when baseMetricId is unknown', () => {
        expect(() =>
            populateCustomMetricsSQL(
                [
                    {
                        kind: 'periodComparison',
                        baseMetricId: 'orders_does_not_exist',
                        timeDimensionId: 'orders_order_date',
                        granularity: TimeFrames.MONTH,
                        periodOffset: 1,
                    },
                ],
                mockOrdersExplore,
            ),
        ).toThrow(/orders_does_not_exist/);
    });
});
