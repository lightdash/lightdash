export {
    getAdditivityType as getPreAggregateMetricAdditivityType,
    isCompatible as isPreAggregateCompatibleMetricType,
} from './additivity';
export * as preAggregateMaterialization from './materialization';
export * from './audit';
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
