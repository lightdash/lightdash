import {
    isPeriodOverPeriodAdditionalMetric,
    MetricType,
    TimeFrames,
    type AdditionalMetric,
    type PeriodComparison,
} from '@lightdash/common';
import { buildPopAdditionalMetricsFromAiInput } from './buildPopAdditionalMetrics';
import { mockOrdersExplore } from './validationExplore.mock';

const baseCustomMetric: AdditionalMetric = {
    table: 'orders',
    name: 'high_value_order_count',
    label: 'High value order count',
    type: MetricType.COUNT,
    sql: '${TABLE}.order_id',
    baseDimensionName: 'order_id',
};

describe('buildPopAdditionalMetricsFromAiInput', () => {
    it('returns empty when periodComparisons is null', () => {
        const result = buildPopAdditionalMetricsFromAiInput({
            periodComparisons: null,
            explore: mockOrdersExplore,
            customMetrics: [],
        });
        expect(result.popAdditionalMetrics).toEqual([]);
        expect(result.popMetricIdsByBase.size).toBe(0);
    });

    it('returns empty when periodComparisons is an empty array', () => {
        const result = buildPopAdditionalMetricsFromAiInput({
            periodComparisons: [],
            explore: mockOrdersExplore,
            customMetrics: [],
        });
        expect(result.popAdditionalMetrics).toEqual([]);
        expect(result.popMetricIdsByBase.size).toBe(0);
    });

    it('builds a PoP additional metric for a real base metric', () => {
        const pc: PeriodComparison = {
            baseMetricId: 'orders_total_revenue',
            timeDimensionId: 'orders_order_date',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        };
        const result = buildPopAdditionalMetricsFromAiInput({
            periodComparisons: [pc],
            explore: mockOrdersExplore,
            customMetrics: [],
        });

        expect(result.popAdditionalMetrics).toHaveLength(1);
        const pop = result.popAdditionalMetrics[0]!;
        expect(isPeriodOverPeriodAdditionalMetric(pop)).toBe(true);
        expect(pop.table).toBe('orders');
        expect(pop.baseMetricId).toBe('orders_total_revenue');
        expect(pop.granularity).toBe(TimeFrames.MONTH);
        expect(pop.periodOffset).toBe(1);
        expect(pop.sql).toBe('SUM(${TABLE}.amount)');

        const ids = result.popMetricIdsByBase.get('orders_total_revenue');
        expect(ids).toHaveLength(1);
        expect(ids![0]!).toBe(`orders_${pop.name}`);
    });

    it('builds a PoP additional metric for a custom base metric', () => {
        const customByItemId = baseCustomMetric;
        const pc: PeriodComparison = {
            baseMetricId: 'orders_high_value_order_count',
            timeDimensionId: 'orders_order_date',
            granularity: TimeFrames.WEEK,
            periodOffset: 2,
        };
        const result = buildPopAdditionalMetricsFromAiInput({
            periodComparisons: [pc],
            explore: mockOrdersExplore,
            customMetrics: [customByItemId],
        });

        expect(result.popAdditionalMetrics).toHaveLength(1);
        const pop = result.popAdditionalMetrics[0]!;
        expect(pop.baseMetricId).toBe('orders_high_value_order_count');
        expect(pop.sql).toBe('${TABLE}.order_id');
        expect(pop.granularity).toBe(TimeFrames.WEEK);
        expect(pop.periodOffset).toBe(2);
    });

    it('dedupes identical (base, dim, granularity, offset) tuples', () => {
        const pc: PeriodComparison = {
            baseMetricId: 'orders_total_revenue',
            timeDimensionId: 'orders_order_date',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        };
        const result = buildPopAdditionalMetricsFromAiInput({
            periodComparisons: [pc, pc],
            explore: mockOrdersExplore,
            customMetrics: [],
        });

        expect(result.popAdditionalMetrics).toHaveLength(1);
        expect(
            result.popMetricIdsByBase.get('orders_total_revenue'),
        ).toHaveLength(1);
    });

    it('keeps distinct entries with different granularity or offset', () => {
        const result = buildPopAdditionalMetricsFromAiInput({
            periodComparisons: [
                {
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 1,
                },
                {
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.YEAR,
                    periodOffset: 1,
                },
                {
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_order_date',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 12,
                },
            ],
            explore: mockOrdersExplore,
            customMetrics: [],
        });

        expect(result.popAdditionalMetrics).toHaveLength(3);
        expect(
            result.popMetricIdsByBase.get('orders_total_revenue'),
        ).toHaveLength(3);
    });

    it('throws AiAgentValidatorError when baseMetricId is unknown', () => {
        expect(() =>
            buildPopAdditionalMetricsFromAiInput({
                periodComparisons: [
                    {
                        baseMetricId: 'orders_does_not_exist',
                        timeDimensionId: 'orders_order_date',
                        granularity: TimeFrames.MONTH,
                        periodOffset: 1,
                    },
                ],
                explore: mockOrdersExplore,
                customMetrics: [],
            }),
        ).toThrow(/orders_does_not_exist/);
    });
});
