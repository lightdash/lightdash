import {
    getAllReferences,
    sqlAggregationWrapsReferences,
} from '../../compiler/exploreCompiler';
import {
    MetricType,
    type CompiledMetric,
    type FieldId,
} from '../../types/field';
import { getItemId } from '../../utils/item';
import { isSupportedMetricType } from './metricRepresentation';
import {
    getReferencedMetricForPreAggregation,
    type PreAggregateReferenceLookup,
} from './referenceLookup';

export enum PreAggregateNumberMetricDependencyIneligibilityReason {
    CIRCULAR_DEPENDENCY = 'circular_dependency',
    NESTED_AGGREGATE_METRIC_REFERENCE = 'nested_aggregate_metric_reference',
    NO_METRIC_REFERENCES = 'no_metric_references',
    UNSUPPORTED_LEAF_METRIC_TYPE = 'unsupported_leaf_metric_type',
}

type PreAggregateNumberMetricDependencyBase = {
    directReferencedMetricFieldIds: FieldId[];
    transitiveReferencedMetricFieldIds: FieldId[];
    leafMetricFieldIds: FieldId[];
};

export type PreAggregateNumberMetricDependencies =
    | ({
          isValid: true;
      } & PreAggregateNumberMetricDependencyBase)
    | ({
          isValid: false;
          reason: PreAggregateNumberMetricDependencyIneligibilityReason;
          ineligibleMetricFieldId: FieldId;
      } & PreAggregateNumberMetricDependencyBase);

type TraversalState = {
    activeMetricFieldIds: Set<FieldId>;
    cache: Map<FieldId, PreAggregateNumberMetricDependencies>;
};

const mergeFieldIds = (current: FieldId[], next: FieldId[]): FieldId[] =>
    Array.from(new Set([...current, ...next]));

const getIneligibleResult = ({
    reason,
    ineligibleMetricFieldId,
    directReferencedMetricFieldIds,
    transitiveReferencedMetricFieldIds,
    leafMetricFieldIds,
}: {
    reason: PreAggregateNumberMetricDependencyIneligibilityReason;
    ineligibleMetricFieldId: FieldId;
} & PreAggregateNumberMetricDependencyBase): PreAggregateNumberMetricDependencies => ({
    isValid: false,
    reason,
    ineligibleMetricFieldId,
    directReferencedMetricFieldIds,
    transitiveReferencedMetricFieldIds,
    leafMetricFieldIds,
});

const analyzeNumberMetricDependencies = ({
    metric,
    tables,
    state,
}: {
    metric: CompiledMetric;
    tables: PreAggregateReferenceLookup;
    state: TraversalState;
}): PreAggregateNumberMetricDependencies => {
    const currentFieldId = getItemId(metric);
    const cachedResult = state.cache.get(currentFieldId);
    if (cachedResult) {
        return cachedResult;
    }

    if (state.activeMetricFieldIds.has(currentFieldId)) {
        return getIneligibleResult({
            reason: PreAggregateNumberMetricDependencyIneligibilityReason.CIRCULAR_DEPENDENCY,
            ineligibleMetricFieldId: currentFieldId,
            directReferencedMetricFieldIds: [],
            transitiveReferencedMetricFieldIds: [],
            leafMetricFieldIds: [],
        });
    }

    state.activeMetricFieldIds.add(currentFieldId);

    let result: PreAggregateNumberMetricDependencies = {
        isValid: true,
        directReferencedMetricFieldIds: [],
        transitiveReferencedMetricFieldIds: [],
        leafMetricFieldIds: [],
    };

    try {
        const directMetricReferences = getAllReferences(metric.sql)
            .map((ref) => ({
                ref,
                referencedMetric: getReferencedMetricForPreAggregation({
                    metric,
                    ref,
                    tables,
                }),
            }))
            .filter(
                (
                    candidate,
                ): candidate is {
                    ref: string;
                    referencedMetric: CompiledMetric;
                } => candidate.referencedMetric !== undefined,
            );

        if (directMetricReferences.length === 0) {
            result = getIneligibleResult({
                reason: PreAggregateNumberMetricDependencyIneligibilityReason.NO_METRIC_REFERENCES,
                ineligibleMetricFieldId: currentFieldId,
                directReferencedMetricFieldIds: [],
                transitiveReferencedMetricFieldIds: [],
                leafMetricFieldIds: [],
            });
            return result;
        }

        if (
            sqlAggregationWrapsReferences(
                metric.sql,
                directMetricReferences.map(({ ref }) => ref),
            )
        ) {
            result = getIneligibleResult({
                reason: PreAggregateNumberMetricDependencyIneligibilityReason.NESTED_AGGREGATE_METRIC_REFERENCE,
                ineligibleMetricFieldId: currentFieldId,
                directReferencedMetricFieldIds: directMetricReferences.map(
                    ({ referencedMetric }) => getItemId(referencedMetric),
                ),
                transitiveReferencedMetricFieldIds: directMetricReferences.map(
                    ({ referencedMetric }) => getItemId(referencedMetric),
                ),
                leafMetricFieldIds: [],
            });
            return result;
        }

        let directReferencedMetricFieldIds: FieldId[] = [];
        let transitiveReferencedMetricFieldIds: FieldId[] = [];
        let leafMetricFieldIds: FieldId[] = [];

        for (const { referencedMetric } of directMetricReferences) {
            const referencedMetricFieldId = getItemId(referencedMetric);
            directReferencedMetricFieldIds = mergeFieldIds(
                directReferencedMetricFieldIds,
                [referencedMetricFieldId],
            );
            transitiveReferencedMetricFieldIds = mergeFieldIds(
                transitiveReferencedMetricFieldIds,
                [referencedMetricFieldId],
            );

            if (referencedMetric.type === MetricType.NUMBER) {
                const nestedResult = analyzeNumberMetricDependencies({
                    metric: referencedMetric,
                    tables,
                    state,
                });

                transitiveReferencedMetricFieldIds = mergeFieldIds(
                    transitiveReferencedMetricFieldIds,
                    nestedResult.transitiveReferencedMetricFieldIds,
                );
                leafMetricFieldIds = mergeFieldIds(
                    leafMetricFieldIds,
                    nestedResult.leafMetricFieldIds,
                );

                if (!nestedResult.isValid) {
                    result = getIneligibleResult({
                        reason: nestedResult.reason,
                        ineligibleMetricFieldId:
                            nestedResult.ineligibleMetricFieldId,
                        directReferencedMetricFieldIds,
                        transitiveReferencedMetricFieldIds,
                        leafMetricFieldIds,
                    });
                    return result;
                }

                // eslint-disable-next-line no-continue
                continue;
            }

            if (!isSupportedMetricType(referencedMetric.type)) {
                result = getIneligibleResult({
                    reason: PreAggregateNumberMetricDependencyIneligibilityReason.UNSUPPORTED_LEAF_METRIC_TYPE,
                    ineligibleMetricFieldId: referencedMetricFieldId,
                    directReferencedMetricFieldIds,
                    transitiveReferencedMetricFieldIds,
                    leafMetricFieldIds,
                });
                return result;
            }

            leafMetricFieldIds = mergeFieldIds(leafMetricFieldIds, [
                referencedMetricFieldId,
            ]);
        }

        result = {
            isValid: true,
            directReferencedMetricFieldIds,
            transitiveReferencedMetricFieldIds,
            leafMetricFieldIds,
        };
        return result;
    } finally {
        state.activeMetricFieldIds.delete(currentFieldId);
        state.cache.set(currentFieldId, result);
    }
};

export const analyzePreAggregateNumberMetricDependencies = ({
    metric,
    tables,
}: {
    metric: CompiledMetric;
    tables: PreAggregateReferenceLookup;
}): PreAggregateNumberMetricDependencies =>
    analyzeNumberMetricDependencies({
        metric,
        tables,
        state: {
            activeMetricFieldIds: new Set<FieldId>(),
            cache: new Map<FieldId, PreAggregateNumberMetricDependencies>(),
        },
    });
