import {
    flattenFilterGroup,
    getItemId,
    isPeriodOverPeriodAdditionalMetric,
    NotSupportedError,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';

const getPopMetricIds = (metricQuery: MetricQuery): Set<string> =>
    new Set(
        (metricQuery.additionalMetrics ?? [])
            .filter(isPeriodOverPeriodAdditionalMetric)
            .map(getItemId),
    );

const assertNoBlockingFilters = (
    metricQuery: MetricQuery,
    errorMessage: string,
) => {
    const hasMetricFilters =
        !!metricQuery.filters.metrics &&
        flattenFilterGroup(metricQuery.filters.metrics).length > 0;
    const hasTableCalculationFilters =
        !!metricQuery.filters.tableCalculations &&
        flattenFilterGroup(metricQuery.filters.tableCalculations).length > 0;

    if (hasMetricFilters || hasTableCalculationFilters) {
        throw new NotSupportedError(errorMessage);
    }
};

// Strip a MetricQuery down to a one-row grand total. PoP metrics are
// dropped because they require their time dim to be selected.
export const getGrandTotalMetricQuery = (
    metricQuery: MetricQuery,
): MetricQuery => {
    const popMetricIds = getPopMetricIds(metricQuery);

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

    assertNoBlockingFilters(
        totalQuery,
        'Totals cannot be correctly calculated with metric filters or table calculation filters',
    );

    return totalQuery;
};

type GetTotalQueryFromSourceArgs = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | null;
};

type GetTotalQueryFromSourceResult = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | undefined;
};

// Pivoted source: re-aggregate by `groupByColumns`, drop `indexColumn`.
// Non-pivoted: delegate to `getGrandTotalMetricQuery` (one row per metric).
export const getColumnTotalQueryFromSource = (
    source: GetTotalQueryFromSourceArgs,
): GetTotalQueryFromSourceResult => {
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
    const popMetricIds = getPopMetricIds(source.metricQuery);

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

    assertNoBlockingFilters(
        totalsMetricQuery,
        'Column totals cannot be calculated when the source query uses metric or table-calculation filters',
    );

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

type GetSubtotalQueryFromSourceArgs = GetTotalQueryFromSourceArgs & {
    subtotalDimensions: string[];
};

// Subtotals collapse the inner row dimensions while keeping the pivot columns,
// so we re-run grouped by `subtotalDimensions` plus the pivot `groupByColumns`
// and emit a flat (non-pivoted) result: one row per subtotal-group × pivot
// value. Correct for every metric type. The treemap (no pivot) case just groups
// by `subtotalDimensions`.
export const getColumnSubtotalQueryFromSource = (
    source: GetSubtotalQueryFromSourceArgs,
): GetTotalQueryFromSourceResult => {
    const subtotalDimensions = source.subtotalDimensions ?? [];
    if (subtotalDimensions.length === 0) {
        throw new NotSupportedError(
            'Column subtotals require at least one subtotal dimension',
        );
    }

    const groupByFieldIds = (
        source.pivotConfiguration?.groupByColumns ?? []
    ).map((g) => g.reference);

    const sourceDimensionIds = new Set(source.metricQuery.dimensions);
    const missing = [...subtotalDimensions, ...groupByFieldIds].filter(
        (id) => !sourceDimensionIds.has(id),
    );
    if (missing.length > 0) {
        throw new NotSupportedError(
            `Column subtotal query references dimensions that were not in the source query: ${missing.join(', ')}`,
        );
    }

    const popMetricIds = getPopMetricIds(source.metricQuery);

    const subtotalMetricQuery: MetricQuery = {
        ...source.metricQuery,
        dimensions: [...new Set([...subtotalDimensions, ...groupByFieldIds])],
        sorts: [],
        tableCalculations: [],
        metrics: source.metricQuery.metrics.filter(
            (id) => !popMetricIds.has(id),
        ),
        additionalMetrics: (source.metricQuery.additionalMetrics ?? []).filter(
            (am) => !isPeriodOverPeriodAdditionalMetric(am),
        ),
    };

    assertNoBlockingFilters(
        subtotalMetricQuery,
        'Column subtotals cannot be calculated when the source query uses metric or table-calculation filters',
    );

    return {
        metricQuery: subtotalMetricQuery,
        pivotConfiguration: undefined,
    };
};

// Returns the field-id references for a `PivotConfiguration.indexColumn`,
// which can be a single column, an array, or undefined.
const getIndexColumnFieldIds = (
    indexColumn: PivotConfiguration['indexColumn'],
): string[] => {
    if (!indexColumn) return [];
    return Array.isArray(indexColumn)
        ? indexColumn.map((c) => c.reference)
        : [indexColumn.reference];
};

// Pivoted source: re-aggregate by `indexColumn`, drop `groupByColumns`.
// Row totals are undefined for non-pivoted queries (each row already
// carries its own metric values), so we reject that case explicitly.
export const getRowTotalQueryFromSource = (
    source: GetTotalQueryFromSourceArgs,
): GetTotalQueryFromSourceResult => {
    const groupByColumns = source.pivotConfiguration?.groupByColumns ?? [];
    const isPivoted = !!source.pivotConfiguration && groupByColumns.length > 0;

    if (!isPivoted) {
        throw new NotSupportedError(
            'Row totals are only supported for pivoted queries',
        );
    }

    const indexFieldIds = getIndexColumnFieldIds(
        source.pivotConfiguration!.indexColumn,
    );
    if (indexFieldIds.length === 0) {
        throw new NotSupportedError(
            'Row totals require a pivot index column on the source query',
        );
    }

    const sourceDimensionIds = new Set(source.metricQuery.dimensions);
    const missing = indexFieldIds.filter((id) => !sourceDimensionIds.has(id));
    if (missing.length > 0) {
        throw new NotSupportedError(
            `Row total query references dimensions that were not in the source query: ${missing.join(', ')}`,
        );
    }

    // PoP metrics are dropped to mirror `getColumnTotalQueryFromSource` —
    // they assume a specific time-dim anchoring that may not survive the
    // collapsed pivot, and keeping the two transforms symmetric makes the
    // contract easier to reason about.
    const popMetricIds = getPopMetricIds(source.metricQuery);

    const totalsMetricQuery: MetricQuery = {
        ...source.metricQuery,
        dimensions: indexFieldIds,
        sorts: [],
        tableCalculations: [],
        metrics: source.metricQuery.metrics.filter(
            (id) => !popMetricIds.has(id),
        ),
        additionalMetrics: (source.metricQuery.additionalMetrics ?? []).filter(
            (am) => !isPeriodOverPeriodAdditionalMetric(am),
        ),
    };

    assertNoBlockingFilters(
        totalsMetricQuery,
        'Row totals cannot be calculated when the source query uses metric or table-calculation filters',
    );

    // `groupByColumns: []` opts out of the pivot SQL path in
    // PivotQueryBuilder, so the totals query returns a flat shape:
    // one row per index-dim value combination with plain metric columns.
    const totalsPivotConfiguration: PivotConfiguration = {
        ...source.pivotConfiguration!,
        groupByColumns: [],
        sortOnlyDimensions: undefined,
        passthroughDimensions: undefined,
    };

    return {
        metricQuery: totalsMetricQuery,
        pivotConfiguration: totalsPivotConfiguration,
    };
};
