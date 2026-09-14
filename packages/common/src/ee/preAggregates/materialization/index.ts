export {
    buildMaterializationMetricQuery,
    getDefaultMaterializationSorts,
} from './buildMaterializationMetricQuery';
export {
    assertDimensionEligibleForDirectMaterialization,
    assertMetricEligibleForPreAggregation,
} from './eligibility';
export {
    MaterializationColumnRole,
    renderMaterializationSql,
    type MaterializationColumn,
    type MaterializationSql,
} from './renderMaterializationSql';
export {
    getDimensionsByReference,
    getMetricReferenceForDef,
    getSelectedDimension,
    selectPreAggregateMetrics,
} from './shared';
