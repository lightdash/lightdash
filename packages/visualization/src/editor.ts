/**
 * The editor surface: the helpers the Lightdash explorer's chart editors
 * call to offer, repair and default a chart's configuration, one chart type
 * at a time. Everything here is internal to Lightdash and changes with the
 * explorer; render with the package root instead.
 */
export {
    getAvailableBigNumberFieldIds,
    resolveBigNumberSelectedField,
} from './bigNumber/config';
export { buildBigNumberModel } from './bigNumber/model';
export {
    applyCartesianStacking,
    applyCartesianType,
    applyReferenceLines,
    buildCartesianSeries,
    buildValidCartesianConfig,
    type CartesianTypeOptions,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    getAvailableCartesianFields,
    getCartesianChartType,
    getPendingFieldIds,
    getReferenceLinesFromSeries,
    getXAxisSortConfig,
    hasCartesianCustomColorsStacking,
    isCartesianStacked,
    isColorByCategoryEligible,
    isConditionalFormattingEligible,
    isStackTypeStacked,
    type ReferenceLineField,
    repairCartesianLayout,
    repairConditionalFormattings,
    toStackType,
} from './cartesian/config';
export {
    buildCartesianEchartsOption,
    CARTESIAN_HOVER_EMPHASIS,
    getAxisTypeFromField,
    type LegendValues,
} from './cartesian/echartsOption';
export { defaultGrid } from './cartesian/grid';
export { finalizeTimeAxisOptions } from './cartesian/timezoneShift';
export {
    calculateKeyColorAssignment,
    calculateSeriesColorAssignment,
} from './colors/mappings';
export { createSeriesColorResolver } from './colors/resolver';
export { type SeriesLike } from './colors/series';
export {
    buildCustomVisualizationData,
    parseCustomVisualizationSpec,
    serializeCustomVisualizationSpec,
} from './custom/config';
export {
    buildValidFunnelConfig,
    DEFAULT_FUNNEL_DATA_INPUT,
    DEFAULT_FUNNEL_LABELS,
    DEFAULT_FUNNEL_LEGEND_POSITION,
    DEFAULT_FUNNEL_SHOW_LEGEND,
    type FunnelSeriesDataPoint,
    getFunnelChartData,
    getFunnelColorDefaults,
    getFunnelSelectedField,
    resolveFunnelFieldId,
} from './funnel/config';
export { buildFunnelEchartsOption } from './funnel/echartsOption';
export {
    getAvailableGaugeFieldIds,
    getEffectiveGaugeSelectedField,
} from './gauge/config';
export { getGaugeSizes, type GaugeSizes } from './gauge/sizes';
export { buildGaugeEchartsOption } from './gauge/echartsOption';
export {
    buildValidPieConfig,
    getPieChartData,
    getPieGroupColorDefaults,
    getPieSelectedMetric,
    getSortedPieGroupLabels,
    isPieValueOptionOverridden,
    type PieChartDataPoint,
    repairPieGroupFieldIds,
    repairPieMetricId,
} from './pie/config';
export {
    buildPieEchartsOption,
    type PieSeriesDataPoint,
} from './pie/echartsOption';
export {
    buildValidSankeyConfig,
    getSankeyData,
    getSankeyFields,
    resolveSankeyMetricFieldId,
    resolveSankeySourceFieldId,
    resolveSankeyTargetFieldId,
} from './sankey/config';
export { buildSankeyEchartsOption } from './sankey/echartsOption';
export { type SankeySeriesDataPoint } from './sankey/transform';
export {
    buildTablePivotInput,
    calculateConditionalFormattingMinMaxMap,
    canUseTableSubtotals,
    getFieldsNeedingMinMax,
    getNumUnpivotedDimensions,
    getRowTotalIndexFieldIds,
    getTableColumnWidth,
    getTableDimensions,
    getTableFieldLabelDefault,
    getTableFieldLabelOverride,
    getTableSelectedItemIds,
    hasTotalableColumns,
    isPivotResultStale,
    isPivotTableEnabled,
    isTableColumnFrozen,
    isTableColumnVisible,
    pruneTableColumnProperties,
    shouldDefaultShowTableNames,
    shouldDisableSubtotals,
} from './table/config';
export {
    buildTableColumns,
    getTableSubtotalCell,
    getUniqueColumnOrder,
    type TableColumnsInput,
    type TableModelColumn,
} from './table/model';
export {
    isPivotRowValue,
    resolvePivotRowFieldIds,
    shouldDisableMetricsAsRows,
} from './table/pivotRows';
export {
    findMatchingSubtotal,
    getRowSubtotalValue,
    getSubtotalGroupKey,
    getSubtotalValueFromGroup,
} from './table/subtotals';
export { type VisualizationTheme } from './theme';
export {
    buildTreemapData,
    getTreemapMetricItem,
    getValidTreemapGroupFieldIds,
    reorderTreemapGroupFieldIds,
    repairTreemapSizeMetricId,
    TREEMAP_DEFAULT_END_COLOR,
    TREEMAP_DEFAULT_LEAF_DEPTH,
    TREEMAP_DEFAULT_START_COLOR,
    TREEMAP_DEFAULT_VISIBLE_MIN,
    type TreemapNode,
} from './treemap/config';
export { buildTreemapEchartsOption } from './treemap/echartsOption';
export {
    getExpectedSeriesMap,
    getSeriesGroupedByField,
    isPivotSeriesOrderDeterminedByQuery,
    mergeExistingAndExpectedSeries,
    moveSeriesGroup,
    sortDimensions,
    type GetExpectedSeriesMapArgs,
    type SeriesGroup,
} from './cartesian/series';
export {
    calculateFallbackSeriesColors,
    calculateSeriesLikeIdentifier,
    getDimensionValueColor,
} from './colors/series';
export { canHaveWarehouseTotal } from './table/totals';
export { computeLimitedRowCount, sliceRows } from './rows';
export {
    buildCartesianChartData,
    buildCartesianEchartsOptionFromData,
    buildCartesianLegendState,
} from './cartesian/echartsOption';
export { resolveThemeColors } from './themeColors';
