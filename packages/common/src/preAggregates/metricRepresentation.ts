import { MetricType } from '../types/field';
import assertUnreachable from '../utils/assertUnreachable';

export type SupportedPreAggregateMetricType =
    | MetricType.SUM
    | MetricType.COUNT
    | MetricType.MIN
    | MetricType.MAX
    | MetricType.AVERAGE;

export enum PreAggregateMetricRepresentationKind {
    DIRECT = 'direct',
    DECOMPOSED = 'decomposed',
    UNSUPPORTED = 'unsupported',
}

export type PreAggregateMetricRepresentation =
    | {
          kind: PreAggregateMetricRepresentationKind.DIRECT;
          metricType: MetricType.SUM | MetricType.MIN | MetricType.MAX;
      }
    | {
          kind: PreAggregateMetricRepresentationKind.DECOMPOSED;
          metricType: MetricType.AVERAGE;
          components: readonly ['sum', 'count'];
      }
    | {
          kind: PreAggregateMetricRepresentationKind.UNSUPPORTED;
      };

export const supportedPreAggregateMetricTypes: SupportedPreAggregateMetricType[] =
    [
        MetricType.SUM,
        MetricType.COUNT,
        MetricType.MIN,
        MetricType.MAX,
        MetricType.AVERAGE,
    ];

export const getPreAggregateMetricRepresentation = (
    metricType: MetricType,
): PreAggregateMetricRepresentation => {
    switch (metricType) {
        case MetricType.SUM:
        case MetricType.COUNT:
            return {
                kind: PreAggregateMetricRepresentationKind.DIRECT,
                metricType: MetricType.SUM,
            };
        case MetricType.MIN:
            return {
                kind: PreAggregateMetricRepresentationKind.DIRECT,
                metricType: MetricType.MIN,
            };
        case MetricType.MAX:
            return {
                kind: PreAggregateMetricRepresentationKind.DIRECT,
                metricType: MetricType.MAX,
            };
        case MetricType.AVERAGE:
            return {
                kind: PreAggregateMetricRepresentationKind.DECOMPOSED,
                metricType: MetricType.AVERAGE,
                components: ['sum', 'count'],
            };
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
            return {
                kind: PreAggregateMetricRepresentationKind.UNSUPPORTED,
            };
        default:
            return assertUnreachable(metricType, `Unknown metric type`);
    }
};

export const isSupportedPreAggregateMetricType = (
    metricType: MetricType,
): metricType is SupportedPreAggregateMetricType =>
    getPreAggregateMetricRepresentation(metricType).kind !==
    PreAggregateMetricRepresentationKind.UNSUPPORTED;
