import {
    flattenFilterGroup,
    getItemId,
    isPeriodOverPeriodAdditionalMetric,
    NotSupportedError,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';

// Strip a MetricQuery down to a one-row grand total. PoP metrics are
// dropped because they require their time dim to be selected.
export const getGrandTotalMetricQuery = (
    metricQuery: MetricQuery,
): MetricQuery => {
    const popMetricIds = new Set(
        (metricQuery.additionalMetrics ?? [])
            .filter(isPeriodOverPeriodAdditionalMetric)
            .map(getItemId),
    );

    const totalQuery: MetricQuery = {
        ...metricQuery,
        limit: 1,
        tableCalculations: [],
        sorts: [],
        dimensions: [],
        customDimensions: metricQuery.customDimensions,
        metrics: metricQuery.metrics.filter((id) => !popMetricIds.has(id)),
        additionalMetrics: (metricQuery.additionalMetrics ?? []).filter(
            (am) => !isPeriodOverPeriodAdditionalMetric(am),
        ),
    };

    const hasMetricFilters =
        !!totalQuery.filters.metrics &&
        flattenFilterGroup(totalQuery.filters.metrics).length > 0;
    const hasTableCalculationFilters =
        !!totalQuery.filters.tableCalculations &&
        flattenFilterGroup(totalQuery.filters.tableCalculations).length > 0;

    if (hasMetricFilters || hasTableCalculationFilters) {
        throw new NotSupportedError(
            'Totals cannot be correctly calculated with metric filters or table calculation filters',
        );
    }

    return totalQuery;
};

type GetColumnTotalQueryFromSourceArgs = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | null;
};

type GetColumnTotalQueryFromSourceResult = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | undefined;
};

// Pivoted source: re-aggregate by `groupByColumns`, drop `indexColumn`.
// Non-pivoted: delegate to `getGrandTotalMetricQuery` (one row per metric).
export const getColumnTotalQueryFromSource = (
    source: GetColumnTotalQueryFromSourceArgs,
): GetColumnTotalQueryFromSourceResult => {
    const groupByColumns = source.pivotConfiguration?.groupByColumns ?? [];
    const isPivoted = !!source.pivotConfiguration && groupByColumns.length > 0;

    if (!isPivoted) {
        return {
            metricQuery: getGrandTotalMetricQuery(source.metricQuery),
            pivotConfiguration: undefined,
        };
    }

    const sourceDimensionIds = new Set(source.metricQuery.dimensions);
    const groupByFieldIds = groupByColumns.map((g) => g.reference);
    const missing = groupByFieldIds.filter((id) => !sourceDimensionIds.has(id));
    if (missing.length > 0) {
        throw new NotSupportedError(
            `Column total query references dimensions that were not in the source query: ${missing.join(', ')}`,
        );
    }

    // PoP entries would fail validation once the index dim is dropped.
    const popMetricIds = new Set(
        (source.metricQuery.additionalMetrics ?? [])
            .filter(isPeriodOverPeriodAdditionalMetric)
            .map(getItemId),
    );

    const totalsMetricQuery: MetricQuery = {
        ...source.metricQuery,
        dimensions: groupByFieldIds,
        sorts: [],
        tableCalculations: [],
        metrics: source.metricQuery.metrics.filter(
            (id) => !popMetricIds.has(id),
        ),
        additionalMetrics: (source.metricQuery.additionalMetrics ?? []).filter(
            (am) => !isPeriodOverPeriodAdditionalMetric(am),
        ),
    };

    const hasMetricFilters =
        !!totalsMetricQuery.filters.metrics &&
        flattenFilterGroup(totalsMetricQuery.filters.metrics).length > 0;
    const hasTableCalculationFilters =
        !!totalsMetricQuery.filters.tableCalculations &&
        flattenFilterGroup(totalsMetricQuery.filters.tableCalculations).length >
            0;
    if (hasMetricFilters || hasTableCalculationFilters) {
        throw new NotSupportedError(
            'Column totals cannot be calculated when the source query uses metric or table-calculation filters',
        );
    }

    const totalsPivotConfiguration: PivotConfiguration = {
        ...source.pivotConfiguration!,
        // Drop index + index-scoped sort helpers; they have no meaning
        // once the pivot collapses to a single wide row.
        indexColumn: undefined,
        sortOnlyDimensions: undefined,
    };

    return {
        metricQuery: totalsMetricQuery,
        pivotConfiguration: totalsPivotConfiguration,
    };
};
