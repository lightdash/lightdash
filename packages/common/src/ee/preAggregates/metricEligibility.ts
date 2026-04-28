import { getAllReferences } from '../../compiler/exploreCompiler';
import type { CompiledMetric, FieldId } from '../../types/field';
import { getItemId } from '../../utils/item';
import { hasLightdashUserContextVariableReference } from '../../utils/lightdashSqlVariables';
import {
    analyzePreAggregateDerivedDimensionEligibility,
    type PreAggregateDerivedDimensionEligibility,
    type PreAggregateDerivedDimensionIneligibilityReason,
} from './dimensionEligibility';
import {
    getReferencedDimensionForPreAggregation,
    getReferencedFilterDimensionForPreAggregation,
    getReferencedMetricForPreAggregation,
    type PreAggregateReferenceLookup,
} from './referenceLookup';

export enum PreAggregateDerivedMetricIneligibilityReason {
    CIRCULAR_DEPENDENCY = 'circular_dependency',
    COMPILATION_ERROR = 'compilation_error',
    DIMENSION_DEPENDENCY_INELIGIBLE = 'dimension_dependency_ineligible',
    FILTER_DIMENSION_INELIGIBLE = 'filter_dimension_ineligible',
    METRIC_DEPENDENCY_INELIGIBLE = 'metric_dependency_ineligible',
    MISSING_DEPENDENCY = 'missing_dependency',
    PARAMETER_REFERENCES = 'parameter_references',
    USER_ATTRIBUTES = 'user_attributes',
}

type PreAggregateDerivedMetricEligibilityBase = {
    referencedDimensionFieldIds: FieldId[];
    referencedMetricFieldIds: FieldId[];
};

export type PreAggregateDerivedMetricEligibility =
    | ({
          isEligible: true;
      } & PreAggregateDerivedMetricEligibilityBase)
    | ({
          isEligible: false;
          ineligibleMetricFieldId: FieldId;
          ineligibleDimensionFieldId?: FieldId;
          ineligibleDimensionReason?: PreAggregateDerivedDimensionIneligibilityReason;
          reason: PreAggregateDerivedMetricIneligibilityReason;
      } & PreAggregateDerivedMetricEligibilityBase);

type EligibilityTraversalState = {
    activeFieldIds: Set<FieldId>;
    cache: Map<FieldId, PreAggregateDerivedMetricEligibility>;
};

const mergeFieldIds = (current: FieldId[], next: FieldId[]): FieldId[] =>
    Array.from(new Set([...current, ...next]));

const hasParameterReferences = (metric: CompiledMetric): boolean =>
    (metric.parameterReferences?.length ?? 0) > 0;

const hasExplicitUserAttributeReference = (sql: string): boolean =>
    hasLightdashUserContextVariableReference(sql);

const getIneligibleMetricResult = ({
    metricFieldId,
    reason,
    referencedDimensionFieldIds,
    referencedMetricFieldIds,
    ineligibleDimensionFieldId,
    ineligibleDimensionReason,
}: {
    metricFieldId: FieldId;
    reason: PreAggregateDerivedMetricIneligibilityReason;
    referencedDimensionFieldIds: FieldId[];
    referencedMetricFieldIds: FieldId[];
    ineligibleDimensionFieldId?: FieldId;
    ineligibleDimensionReason?: PreAggregateDerivedDimensionIneligibilityReason;
}): PreAggregateDerivedMetricEligibility => ({
    isEligible: false,
    reason,
    ineligibleMetricFieldId: metricFieldId,
    ...(ineligibleDimensionFieldId ? { ineligibleDimensionFieldId } : {}),
    ...(ineligibleDimensionReason ? { ineligibleDimensionReason } : {}),
    referencedDimensionFieldIds,
    referencedMetricFieldIds,
});

const mergeDimensionEligibility = ({
    result,
    eligibility,
}: {
    result: PreAggregateDerivedMetricEligibilityBase;
    eligibility: PreAggregateDerivedDimensionEligibility;
}): PreAggregateDerivedMetricEligibilityBase => ({
    referencedDimensionFieldIds: mergeFieldIds(
        result.referencedDimensionFieldIds,
        eligibility.referencedDimensionFieldIds,
    ),
    referencedMetricFieldIds: result.referencedMetricFieldIds,
});

const analyzeMetricEligibility = ({
    metric,
    tables,
    state,
}: {
    metric: CompiledMetric;
    tables: PreAggregateReferenceLookup;
    state: EligibilityTraversalState;
}): PreAggregateDerivedMetricEligibility => {
    const currentFieldId = getItemId(metric);
    const cachedResult = state.cache.get(currentFieldId);
    if (cachedResult) {
        return cachedResult;
    }

    if (state.activeFieldIds.has(currentFieldId)) {
        return getIneligibleMetricResult({
            metricFieldId: currentFieldId,
            reason: PreAggregateDerivedMetricIneligibilityReason.CIRCULAR_DEPENDENCY,
            referencedDimensionFieldIds: [],
            referencedMetricFieldIds: [currentFieldId],
        });
    }

    state.activeFieldIds.add(currentFieldId);

    let result: PreAggregateDerivedMetricEligibility = {
        isEligible: true,
        referencedDimensionFieldIds: [],
        referencedMetricFieldIds: [currentFieldId],
    };

    try {
        if (metric.compilationError) {
            result = getIneligibleMetricResult({
                metricFieldId: currentFieldId,
                reason: PreAggregateDerivedMetricIneligibilityReason.COMPILATION_ERROR,
                referencedDimensionFieldIds: [],
                referencedMetricFieldIds: [currentFieldId],
            });
            return result;
        }

        if (hasParameterReferences(metric)) {
            result = getIneligibleMetricResult({
                metricFieldId: currentFieldId,
                reason: PreAggregateDerivedMetricIneligibilityReason.PARAMETER_REFERENCES,
                referencedDimensionFieldIds: [],
                referencedMetricFieldIds: [currentFieldId],
            });
            return result;
        }

        if (hasExplicitUserAttributeReference(metric.sql)) {
            result = getIneligibleMetricResult({
                metricFieldId: currentFieldId,
                reason: PreAggregateDerivedMetricIneligibilityReason.USER_ATTRIBUTES,
                referencedDimensionFieldIds: [],
                referencedMetricFieldIds: [currentFieldId],
            });
            return result;
        }

        for (const ref of getAllReferences(metric.sql)) {
            if (ref === 'TABLE') {
                // eslint-disable-next-line no-continue
                continue;
            }

            const referencedDimension = getReferencedDimensionForPreAggregation(
                {
                    metric,
                    ref,
                    tables,
                },
            );

            if (referencedDimension) {
                const dimensionEligibility =
                    analyzePreAggregateDerivedDimensionEligibility({
                        dimension: referencedDimension,
                        tables,
                    });
                const mergedResult = mergeDimensionEligibility({
                    result,
                    eligibility: dimensionEligibility,
                });

                if (!dimensionEligibility.isEligible) {
                    result = getIneligibleMetricResult({
                        metricFieldId: currentFieldId,
                        reason: PreAggregateDerivedMetricIneligibilityReason.DIMENSION_DEPENDENCY_INELIGIBLE,
                        ineligibleDimensionFieldId:
                            dimensionEligibility.ineligibleDimensionFieldId,
                        ineligibleDimensionReason: dimensionEligibility.reason,
                        referencedDimensionFieldIds:
                            mergedResult.referencedDimensionFieldIds,
                        referencedMetricFieldIds:
                            mergedResult.referencedMetricFieldIds,
                    });
                    return result;
                }

                result = {
                    isEligible: true,
                    referencedDimensionFieldIds:
                        mergedResult.referencedDimensionFieldIds,
                    referencedMetricFieldIds:
                        mergedResult.referencedMetricFieldIds,
                };
                // eslint-disable-next-line no-continue
                continue;
            }

            const referencedMetric = getReferencedMetricForPreAggregation({
                metric,
                ref,
                tables,
            });

            if (referencedMetric) {
                const metricEligibility = analyzeMetricEligibility({
                    metric: referencedMetric,
                    tables,
                    state,
                });
                const mergedDimensionFieldIds = mergeFieldIds(
                    result.referencedDimensionFieldIds,
                    metricEligibility.referencedDimensionFieldIds,
                );
                const mergedMetricFieldIds = mergeFieldIds(
                    result.referencedMetricFieldIds,
                    metricEligibility.referencedMetricFieldIds,
                );

                if (!metricEligibility.isEligible) {
                    result = {
                        isEligible: false,
                        reason: PreAggregateDerivedMetricIneligibilityReason.METRIC_DEPENDENCY_INELIGIBLE,
                        ineligibleMetricFieldId:
                            metricEligibility.ineligibleMetricFieldId,
                        ...(metricEligibility.ineligibleDimensionFieldId
                            ? {
                                  ineligibleDimensionFieldId:
                                      metricEligibility.ineligibleDimensionFieldId,
                              }
                            : {}),
                        referencedDimensionFieldIds: mergedDimensionFieldIds,
                        referencedMetricFieldIds: mergedMetricFieldIds,
                    };
                    return result;
                }

                result = {
                    isEligible: true,
                    referencedDimensionFieldIds: mergedDimensionFieldIds,
                    referencedMetricFieldIds: mergedMetricFieldIds,
                };
                // eslint-disable-next-line no-continue
                continue;
            }

            result = getIneligibleMetricResult({
                metricFieldId: currentFieldId,
                reason: PreAggregateDerivedMetricIneligibilityReason.MISSING_DEPENDENCY,
                referencedDimensionFieldIds: result.referencedDimensionFieldIds,
                referencedMetricFieldIds: result.referencedMetricFieldIds,
            });
            return result;
        }

        if (metric.filters) {
            for (const filter of metric.filters) {
                const fieldRef =
                    // @ts-expect-error This fallback is to support old metric filters in yml. We can delete this after a few months since we can assume all projects have been redeployed
                    (filter.target.fieldRef || filter.target.fieldId) as string;

                const referencedDimension =
                    getReferencedFilterDimensionForPreAggregation({
                        metric,
                        fieldRef,
                        tables,
                    });

                if (!referencedDimension) {
                    result = getIneligibleMetricResult({
                        metricFieldId: currentFieldId,
                        reason: PreAggregateDerivedMetricIneligibilityReason.MISSING_DEPENDENCY,
                        referencedDimensionFieldIds:
                            result.referencedDimensionFieldIds,
                        referencedMetricFieldIds:
                            result.referencedMetricFieldIds,
                    });
                    return result;
                }

                const dimensionEligibility =
                    analyzePreAggregateDerivedDimensionEligibility({
                        dimension: referencedDimension,
                        tables,
                    });
                const mergedResult = mergeDimensionEligibility({
                    result,
                    eligibility: dimensionEligibility,
                });

                if (!dimensionEligibility.isEligible) {
                    result = getIneligibleMetricResult({
                        metricFieldId: currentFieldId,
                        reason: PreAggregateDerivedMetricIneligibilityReason.FILTER_DIMENSION_INELIGIBLE,
                        ineligibleDimensionFieldId:
                            dimensionEligibility.ineligibleDimensionFieldId,
                        ineligibleDimensionReason: dimensionEligibility.reason,
                        referencedDimensionFieldIds:
                            mergedResult.referencedDimensionFieldIds,
                        referencedMetricFieldIds:
                            mergedResult.referencedMetricFieldIds,
                    });
                    return result;
                }

                result = {
                    isEligible: true,
                    referencedDimensionFieldIds:
                        mergedResult.referencedDimensionFieldIds,
                    referencedMetricFieldIds:
                        mergedResult.referencedMetricFieldIds,
                };
            }
        }

        return result;
    } finally {
        state.activeFieldIds.delete(currentFieldId);
        state.cache.set(currentFieldId, result);
    }
};

export const analyzePreAggregateDerivedMetricEligibility = ({
    metric,
    tables,
}: {
    metric: CompiledMetric;
    tables: PreAggregateReferenceLookup;
}): PreAggregateDerivedMetricEligibility =>
    analyzeMetricEligibility({
        metric,
        tables,
        state: {
            activeFieldIds: new Set<FieldId>(),
            cache: new Map<FieldId, PreAggregateDerivedMetricEligibility>(),
        },
    });
