import { MetricType } from '../../types/field';
import assertUnreachable from '../../utils/assertUnreachable';

export enum PreAggregateAdditivityType {
    ADDITIVE = 'additive',
    DECOMPOSABLE = 'decomposable',
    NON_ADDITIVE = 'non_additive',
}

export const getAdditivityType = (
    metricType: MetricType,
): PreAggregateAdditivityType => {
    switch (metricType) {
        case MetricType.SUM:
        case MetricType.COUNT:
        case MetricType.MIN:
        case MetricType.MAX:
            return PreAggregateAdditivityType.ADDITIVE;
        case MetricType.AVERAGE:
            return PreAggregateAdditivityType.DECOMPOSABLE;
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM_DISTINCT:
        case MetricType.AVERAGE_DISTINCT:
        case MetricType.MEDIAN:
        case MetricType.PERCENTILE:
        case MetricType.NUMBER:
        case MetricType.STRING:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case MetricType.BOOLEAN:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
            return PreAggregateAdditivityType.NON_ADDITIVE;
        default:
            return assertUnreachable(metricType, `Unknown metric type`);
    }
};

export const isCompatible = (metricType: MetricType): boolean => {
    const additivityType = getAdditivityType(metricType);

    switch (additivityType) {
        case PreAggregateAdditivityType.ADDITIVE:
        case PreAggregateAdditivityType.DECOMPOSABLE:
            return true;
        case PreAggregateAdditivityType.NON_ADDITIVE:
            return false;
        default:
            return assertUnreachable(additivityType, `Unknown additivity type`);
    }
};
