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
export { applyUserBypass, findMatch } from './matcher';
export {
    getMetricRepresentation,
    isSupportedMetricType,
    supportedMetricTypes,
} from './metricRepresentation';
export {
    getDimensionBaseName,
    getDimensionReferences,
    getMetricReferences,
    getMetricsByReference,
} from './references';
