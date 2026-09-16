import { isMetric, MetricType, type ItemsMap } from '../types/field';
import assertUnreachable from './assertUnreachable';
import { getItemLabelWithoutTableName } from './item';

export type MergeTotalAggregation = 'sum' | 'min' | 'max';

/**
 * How a merged column is totalled from the merged rows, or null when no
 * aggregate over those rows is exact. Every source value appears once per
 * key, because fan-out is refused, so sums, counts, minimums and maximums
 * add up; an average of averages or a count of distinct counts does not.
 */
export const getMergeTotalAggregation = (
    item: ItemsMap[string] | undefined,
): MergeTotalAggregation | null => {
    if (!item || !isMetric(item)) return null;
    const { type } = item;
    switch (type) {
        case MetricType.SUM:
        case MetricType.COUNT:
            return 'sum';
        case MetricType.MIN:
            return 'min';
        case MetricType.MAX:
            return 'max';
        case MetricType.AVERAGE:
        case MetricType.AVERAGE_DISTINCT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM_DISTINCT:
        case MetricType.MEDIAN:
        case MetricType.PERCENTILE:
        case MetricType.NUMBER:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case MetricType.BOOLEAN:
            return null;
        default:
            return assertUnreachable(type, `Unknown metric type`);
    }
};

const describeMetricType = (type: MetricType): string => {
    switch (type) {
        case MetricType.AVERAGE:
        case MetricType.AVERAGE_DISTINCT:
            return 'an average';
        case MetricType.COUNT_DISTINCT:
            return 'a distinct count';
        case MetricType.SUM_DISTINCT:
            return 'a distinct sum';
        case MetricType.MEDIAN:
            return 'a median';
        case MetricType.PERCENTILE:
            return 'a percentile';
        case MetricType.NUMBER:
            return 'a custom calculation';
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
            return 'relative to other rows';
        case MetricType.SUM:
        case MetricType.COUNT:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case MetricType.BOOLEAN:
            return 'not a sum, count, minimum or maximum';
        default:
            return assertUnreachable(type, `Unknown metric type`);
    }
};

/** Why a merged column has no total, in the user's terms. */
export const getMergeTotalUnavailableReason = (
    item: ItemsMap[string],
): string => {
    const label = getItemLabelWithoutTableName(item);
    const what = isMetric(item)
        ? describeMetricType(item.type)
        : 'not a metric';
    return `Totals over merged rows are exact only for sums, counts, minimums and maximums. ${label} is ${what}, so it has no total here.`;
};
