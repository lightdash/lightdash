import {
    analyzePreAggregateDerivedDimensionEligibility,
    analyzePreAggregateDerivedMetricEligibility,
    ParameterError,
    PreAggregateDerivedMetricIneligibilityReason,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type PreAggregateDef,
} from '@lightdash/common';

export const assertDimensionEligibleForDirectMaterialization = ({
    sourceExplore,
    preAggregateDef,
    dimensionReference,
    dimension,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    dimensionReference: string;
    dimension: CompiledDimension;
}): void => {
    const eligibility = analyzePreAggregateDerivedDimensionEligibility({
        dimension,
        tables: sourceExplore.tables,
    });

    if (!eligibility.isEligible) {
        throw new ParameterError(
            `Pre-aggregate "${preAggregateDef.name}" references ineligible dimension "${dimensionReference}": dimension "${eligibility.ineligibleDimensionFieldId}" is not eligible for direct materialization (reason: ${eligibility.reason})`,
        );
    }
};

export const assertMetricEligibleForPreAggregation = ({
    sourceExplore,
    preAggregateDef,
    metricReference,
    metric,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
    metricReference: string;
    metric: CompiledMetric;
}): void => {
    const eligibility = analyzePreAggregateDerivedMetricEligibility({
        metric,
        tables: sourceExplore.tables,
    });

    if (!eligibility.isEligible) {
        if (
            eligibility.reason ===
                PreAggregateDerivedMetricIneligibilityReason.FILTER_DIMENSION_INELIGIBLE ||
            eligibility.reason ===
                PreAggregateDerivedMetricIneligibilityReason.DIMENSION_DEPENDENCY_INELIGIBLE
        ) {
            throw new ParameterError(
                `Pre-aggregate "${preAggregateDef.name}" references ineligible metric "${metricReference}": dimension "${eligibility.ineligibleDimensionFieldId}" is not eligible for pre-aggregation${
                    eligibility.reason ===
                    PreAggregateDerivedMetricIneligibilityReason.FILTER_DIMENSION_INELIGIBLE
                        ? ' metric filters'
                        : ''
                } (reason: ${eligibility.ineligibleDimensionReason})`,
            );
        }

        throw new ParameterError(
            `Pre-aggregate "${preAggregateDef.name}" references ineligible metric "${metricReference}": metric "${eligibility.ineligibleMetricFieldId}" is not eligible for pre-aggregation (reason: ${eligibility.reason})`,
        );
    }
};
