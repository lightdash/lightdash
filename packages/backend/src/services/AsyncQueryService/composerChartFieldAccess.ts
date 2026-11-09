import {
    AuthorizationError,
    getCustomMetricDimensionId,
    getFilterRulesFromGroup,
    getItemMap,
    isCustomBinDimension,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';

/** Every explore field a metric query reads: selected, filtered on, or the base of a custom field. */
export const getMetricQueryFieldReferences = (
    metricQuery: MetricQuery,
): string[] => {
    const { filters } = metricQuery;
    const filterTargets = [
        ...getFilterRulesFromGroup(filters.dimensions),
        ...getFilterRulesFromGroup(filters.metrics),
        ...getFilterRulesFromGroup(filters.tableCalculations),
    ].map((rule) => rule.target.fieldId);
    const additionalMetricBases = (metricQuery.additionalMetrics ?? []).flatMap(
        (metric) =>
            metric.baseDimensionName
                ? [getCustomMetricDimensionId(metric)]
                : [],
    );
    const customDimensionBases = (metricQuery.customDimensions ?? []).flatMap(
        (dimension) =>
            isCustomBinDimension(dimension) ? [dimension.dimensionId] : [],
    );
    return [
        ...new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...filterTargets,
            ...additionalMetricBases,
            ...customDimensionBases,
        ]),
    ];
};

/**
 * Refuses a query that reads a field the viewer's attribute-filtered explore
 * hides, exactly as compiling it would. A field in neither the filtered nor
 * the unfiltered tables is not an access matter and is left to the compiler.
 */
export const assertMetricQueryFieldsVisible = (
    metricQuery: MetricQuery,
    explore: Explore,
): void => {
    const visible = getItemMap(
        explore,
        metricQuery.additionalMetrics,
        metricQuery.tableCalculations,
        metricQuery.customDimensions,
    );
    const unfiltered = getItemMap({
        ...explore,
        tables: explore.unfilteredTables ?? {},
    });
    const hidden = getMetricQueryFieldReferences(metricQuery).some(
        (fieldId) => !(fieldId in visible) && fieldId in unfiltered,
    );
    if (hidden) {
        throw new AuthorizationError(
            "You don't have authorization to access this explore",
        );
    }
};
