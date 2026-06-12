import {
    convertFieldRefToFieldId,
    flattenFilterGroup,
    getItemId,
    isFormulaTableCalculation,
    isPeriodOverPeriodAdditionalMetric,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    lightdashVariablePattern,
    NotSupportedError,
    parseTableCalculationFunctions,
    type MetricQuery,
    type PivotConfiguration,
    type TableCalculation,
} from '@lightdash/common';
import {
    containsAggregateOrWindow,
    extractColumnRefs,
    parse as parseFormula,
} from '@lightdash/formula';

const getPopMetricIds = (metricQuery: MetricQuery): Set<string> =>
    new Set(
        (metricQuery.additionalMetrics ?? [])
            .filter(isPeriodOverPeriodAdditionalMetric)
            .map(getItemId),
    );

const WINDOW_CLAUSE_PATTERN = /\bover\s*\(/i;

// Extract the field ids a table calc references, or null if the calc can't be
// safely totaled. Only pure per-row scalar arithmetic over metrics survives:
// template calcs, row/pivot/total helper functions, raw window SQL, and formula
// aggregates/window functions all compile to cross-row/cross-column SQL that is
// meaningless once the query collapses to a totals row.
const getTotalableReferences = (calc: TableCalculation): string[] | null => {
    if (isTemplateTableCalculation(calc)) {
        return null;
    }

    if (isSqlTableCalculation(calc)) {
        if (
            WINDOW_CLAUSE_PATTERN.test(calc.sql) ||
            parseTableCalculationFunctions(calc.sql).length > 0
        ) {
            return null;
        }
        try {
            // convertFieldRefToFieldId throws on refs that aren't `table.field`;
            // treat an unresolvable ref as non-totalable rather than failing the
            // whole totals query.
            return [...calc.sql.matchAll(lightdashVariablePattern)].map(
                (match) =>
                    match[1].includes('.')
                        ? convertFieldRefToFieldId(match[1])
                        : match[1],
            );
        } catch {
            return null;
        }
    }

    if (isFormulaTableCalculation(calc)) {
        try {
            const ast = parseFormula(calc.formula);
            if (containsAggregateOrWindow(ast)) {
                return null;
            }
            return extractColumnRefs(ast);
        } catch {
            return null;
        }
    }

    return null;
};

// A table calc can be totaled when it depends only on aggregated metrics:
// applying its formula to the collapsed totals row reproduces the correct
// total. Calcs that reference dimensions, dropped PoP metrics, sibling table
// calcs, or use window functions are excluded (their total stays blank).
const getTotalableTableCalculations = (
    metricQuery: MetricQuery,
    keptMetricIds: Set<string>,
): TableCalculation[] =>
    metricQuery.tableCalculations.filter((calc) => {
        const references = getTotalableReferences(calc);
        return (
            references !== null &&
            references.length > 0 &&
            references.every((ref) => keptMetricIds.has(ref))
        );
    });

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
    const keptMetrics = metricQuery.metrics.filter(
        (id) => !popMetricIds.has(id),
    );

    const totalQuery: MetricQuery = {
        ...metricQuery,
        limit: 1,
        tableCalculations: getTotalableTableCalculations(
            metricQuery,
            new Set(keptMetrics),
        ),
        sorts: [],
        dimensions: [],
        customDimensions: metricQuery.customDimensions,
        metrics: keptMetrics,
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
    arrayDimensionIds?: Set<string>;
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

    const retainedArrayDims = groupByFieldIds.filter((id) =>
        source.arrayDimensionIds?.has(id),
    );
    if (retainedArrayDims.length > 0) {
        throw new NotSupportedError(
            `Subtotals aren't supported over an unnested (array) dimension: ${retainedArrayDims.join(', ')}`,
        );
    }

    // PoP entries would fail validation once the index dim is dropped.
    const popMetricIds = getPopMetricIds(source.metricQuery);
    const keptMetrics = source.metricQuery.metrics.filter(
        (id) => !popMetricIds.has(id),
    );

    const totalsMetricQuery: MetricQuery = {
        ...source.metricQuery,
        dimensions: groupByFieldIds,
        sorts: [],
        tableCalculations: getTotalableTableCalculations(
            source.metricQuery,
            new Set(keptMetrics),
        ),
        metrics: keptMetrics,
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

    const retainedArrayDims = [
        ...subtotalDimensions,
        ...groupByFieldIds,
    ].filter((id) => source.arrayDimensionIds?.has(id));
    if (retainedArrayDims.length > 0) {
        throw new NotSupportedError(
            `Subtotals aren't supported over an unnested (array) dimension: ${retainedArrayDims.join(', ')}`,
        );
    }

    const popMetricIds = getPopMetricIds(source.metricQuery);
    const keptMetrics = source.metricQuery.metrics.filter(
        (id) => !popMetricIds.has(id),
    );

    const subtotalMetricQuery: MetricQuery = {
        ...source.metricQuery,
        dimensions: [...new Set([...subtotalDimensions, ...groupByFieldIds])],
        sorts: [],
        tableCalculations: getTotalableTableCalculations(
            source.metricQuery,
            new Set(keptMetrics),
        ),
        metrics: keptMetrics,
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
    const keptMetrics = source.metricQuery.metrics.filter(
        (id) => !popMetricIds.has(id),
    );

    const totalsMetricQuery: MetricQuery = {
        ...source.metricQuery,
        dimensions: indexFieldIds,
        sorts: [],
        tableCalculations: getTotalableTableCalculations(
            source.metricQuery,
            new Set(keptMetrics),
        ),
        metrics: keptMetrics,
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
    // Keep only sorts on index columns: the collapsed query no longer selects
    // pivot/groupBy dimensions and exposes metrics under an `_any` alias, so any
    // other sort reference would produce an ORDER BY on a non-existent column.
    // Row totals are matched by index key, not order, so this is safe.
    const indexFieldIdSet = new Set(indexFieldIds);
    const totalsPivotConfiguration: PivotConfiguration = {
        ...source.pivotConfiguration!,
        groupByColumns: [],
        sortBy: source.pivotConfiguration!.sortBy?.filter((sort) =>
            indexFieldIdSet.has(sort.reference),
        ),
        sortOnlyDimensions: undefined,
        passthroughDimensions: undefined,
    };

    return {
        metricQuery: totalsMetricQuery,
        pivotConfiguration: totalsPivotConfiguration,
    };
};
