import { MetricType } from '../types/field';
import assertUnreachable from '../utils/assertUnreachable';

export enum AdditivityType {
    ADDITIVE = 'additive',
    DECOMPOSABLE = 'decomposable',
    NON_ADDITIVE = 'non_additive',
}

export const getAdditivityType = (metricType: MetricType): AdditivityType => {
    switch (metricType) {
        case MetricType.SUM:
        case MetricType.COUNT:
        case MetricType.MIN:
        case MetricType.MAX:
            return AdditivityType.ADDITIVE;
        case MetricType.AVERAGE:
            return AdditivityType.DECOMPOSABLE;
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM_DISTINCT:
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
            return AdditivityType.NON_ADDITIVE;
        default:
            return assertUnreachable(metricType, `Unknown metric type`);
    }
};

export const isReAggregatable = (metricType: MetricType): boolean =>
    getAdditivityType(metricType) === AdditivityType.ADDITIVE;
