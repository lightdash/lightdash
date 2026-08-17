import { MetricType } from '../../types/field';
import assertUnreachable from '../../utils/assertUnreachable';

export type PreAggregateSupportedMetricType =
    | MetricType.SUM
    | MetricType.COUNT
    | MetricType.MIN
    | MetricType.MAX
    | MetricType.AVERAGE
    | MetricType.COUNT_DISTINCT
    | MetricType.SUM_DISTINCT
    | MetricType.AVERAGE_DISTINCT
    | MetricType.MEDIAN
    | MetricType.PERCENTILE;

export enum PreAggregateMetricRepresentationKind {
    DIRECT = 'direct',
    DECOMPOSED = 'decomposed',
    // Stored as a single plain value column; servable only on an exact match,
    // where each result row maps to one materialization row.
    EXACT_ONLY = 'exact_only',
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
          kind: PreAggregateMetricRepresentationKind.EXACT_ONLY;
      }
    | {
          kind: PreAggregateMetricRepresentationKind.UNSUPPORTED;
      };

export const supportedMetricTypes: PreAggregateSupportedMetricType[] = [
    MetricType.SUM,
    MetricType.COUNT,
    MetricType.MIN,
    MetricType.MAX,
    MetricType.AVERAGE,
    MetricType.COUNT_DISTINCT,
    MetricType.SUM_DISTINCT,
    MetricType.AVERAGE_DISTINCT,
    MetricType.MEDIAN,
    MetricType.PERCENTILE,
];

export const getMetricRepresentation = (
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
        case MetricType.AVERAGE_DISTINCT:
        case MetricType.MEDIAN:
        case MetricType.PERCENTILE:
            return {
                kind: PreAggregateMetricRepresentationKind.EXACT_ONLY,
            };
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

export const isSupportedMetricType = (
    metricType: MetricType,
): metricType is PreAggregateSupportedMetricType =>
    getMetricRepresentation(metricType).kind !==
    PreAggregateMetricRepresentationKind.UNSUPPORTED;

// Re-aggregatable = safe to combine across materialization rows (direct or
// decomposed). Exact-only metrics are supported but never re-aggregatable.
export const isReAggregatableMetricType = (metricType: MetricType): boolean => {
    const { kind } = getMetricRepresentation(metricType);
    return (
        kind === PreAggregateMetricRepresentationKind.DIRECT ||
        kind === PreAggregateMetricRepresentationKind.DECOMPOSED
    );
};
