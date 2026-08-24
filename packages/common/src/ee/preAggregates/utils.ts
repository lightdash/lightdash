export { getAdditivityType, isCompatible } from './additivity';
export {
    analyzePreAggregateDerivedDimensionEligibility,
    PreAggregateDerivedDimensionIneligibilityReason,
    type PreAggregateDerivedDimensionEligibility,
} from './dimensionEligibility';
export {
    analyzePreAggregateDerivedMetricEligibility,
    PreAggregateDerivedMetricIneligibilityReason,
    type PreAggregateDerivedMetricEligibility,
} from './metricEligibility';
export {
    analyzePreAggregateNumberMetricDependencies,
    PreAggregateNumberMetricDependencyIneligibilityReason,
    type PreAggregateNumberMetricDependencies,
} from './numberMetricDependencies';
export {
    applyUserBypass,
    findMatch,
    getActiveCustomDimensions,
} from './matcher';
export {
    getMetricRepresentation,
    isSupportedMetricType,
    supportedMetricTypes,
} from './metricRepresentation';
export {
    getEffectiveDimensionTimeFrame,
    getPreAggregateGranularityRank,
    getTimeFrameDerivability,
    TimeFrameDerivability,
} from './timeFrameDerivability';
export {
    getDimensionBaseName,
    getDimensionReferences,
    getMetricReferences,
    getMetricsByReference,
} from './references';
