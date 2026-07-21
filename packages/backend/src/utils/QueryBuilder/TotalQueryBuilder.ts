import {
    assertUnreachable,
    convertFieldRefToFieldId,
    getItemId,
    isFormulaTableCalculation,
    isPeriodOverPeriodAdditionalMetric,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    lightdashVariablePattern,
    NotSupportedError,
    parseTableCalculationFunctions,
    TableCalculationTotalMode,
    type MetricQuery,
    type PivotConfiguration,
    type TableCalculation,
} from '@lightdash/common';
import {
    containsAggregateOrWindow,
    extractColumnRefs,
    parse as parseFormula,
} from '@lightdash/formula';
import {
    getSumOfRowsTableCalculations,
    hasBlockingTotalFilters,
    type TotalQueryKind,
} from './utils';

export type { TotalQueryKind } from './utils';

const WINDOW_CLAUSE_PATTERN = /\bover\s*\(/i;

const getPopMetricIds = (metricQuery: MetricQuery): Set<string> =>
    new Set(
        (metricQuery.additionalMetrics ?? [])
            .filter(isPeriodOverPeriodAdditionalMetric)
            .map(getItemId),
    );

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
// calcs, or use window functions are excluded (their total stays blank), as
// are 'sum_of_rows' calcs (aggregated over the embedded source rows instead)
// and 'none' calcs (totals disabled by the user).
const getTotalableTableCalculations = (
    metricQuery: MetricQuery,
    keptMetricIds: Set<string>,
): TableCalculation[] =>
    metricQuery.tableCalculations.filter((calc) => {
        if (
            calc.totalMode === TableCalculationTotalMode.SUM_OF_ROWS ||
            calc.totalMode === TableCalculationTotalMode.NONE
        ) {
            return false;
        }
        const references = getTotalableReferences(calc);
        return (
            references !== null &&
            references.length > 0 &&
            references.every((ref) => keptMetricIds.has(ref))
        );
    });

// Drop value columns that reference fields not present in the totals query:
// PoP metrics and non-totalable table calcs are stripped from the metric query,
// but the pivot still lists them. Keeping them makes PivotQueryBuilder aggregate
// a column that was never selected, failing the whole totals SQL. Sum-of-rows
// calcs stay: their columns are joined into the flat totals SQL.
const filterTotalsValuesColumns = (
    valuesColumns: PivotConfiguration['valuesColumns'],
    keptMetricIds: Set<string>,
    totalableCalcs: TableCalculation[],
    sumOfRowsCalcs: TableCalculation[],
): PivotConfiguration['valuesColumns'] => {
    const allowed = new Set<string>([
        ...keptMetricIds,
        ...totalableCalcs.map((calc) => calc.name),
        ...sumOfRowsCalcs.map((calc) => calc.name),
    ]);
    return valuesColumns.filter((col) => allowed.has(col.reference));
};

// Metric / table-calc filters are evaluated at the source-row grain, so they
// can't survive into the collapsed totals query (they would filter the totals
// rows themselves). They are stripped here and enforced via the embedded
// `sourceQuery` instead: a semi-join restricting raw rows to the source
// query's passing dimension groups.
const stripBlockingFilters = (
    filters: MetricQuery['filters'],
): MetricQuery['filters'] =>
    filters.dimensions ? { dimensions: filters.dimensions } : {};

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

export type TotalQueryBuilderArgs = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | null;
    kind: TotalQueryKind;
    // Required only for `columnSubtotal`.
    subtotalDimensions?: string[];
};

/**
 * The source query the totals SQL embeds (once) to compute on top of the
 * original results. `MetricQueryBuilder` derives HOW from the totals
 * configuration and the two queries themselves (filter restrictions,
 * visible-page pinning, sum-of-rows aggregations).
 */
export type TotalQuerySourceQuery = {
    // Source query verbatim; the builder embeds it without ORDER BY / LIMIT
    // and re-applies them only where the visible page is needed.
    metricQuery: MetricQuery;
    // The SOURCE pivot configuration, so table calcs using total()/row_total()
    // compile the same way they did in the source query.
    pivotConfiguration: PivotConfiguration | undefined;
};

export type TotalQueryResult = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | undefined;
    // Set only when the totals SQL must compute on top of the source query's
    // results (blocking filters, subtotal page pinning, sum-of-rows calcs).
    sourceQuery?: TotalQuerySourceQuery;
};

/**
 * Transforms a source query (`metricQuery` + `pivotConfiguration`) into the
 * totals query that reproduces the requested grand/row/column/subtotal grain.
 * Mirrors `MetricQueryBuilder`'s public surface: configure everything through
 * the constructor, then call `compileQuery()`.
 *
 * This builds the totals *query* (a transformed `MetricQuery` +
 * `PivotConfiguration`); the SQL is produced downstream by the normal
 * execution path (`MetricQueryBuilder` / `PivotQueryBuilder`).
 */
export class TotalQueryBuilder {
    constructor(private readonly args: TotalQueryBuilderArgs) {}

    public compileQuery(): TotalQueryResult {
        const { kind } = this.args;
        const sourceQuery = this.buildSourceQuery();
        switch (kind) {
            case 'grandTotal':
                return {
                    metricQuery: this.buildGrandTotalMetricQuery(),
                    pivotConfiguration: undefined,
                    sourceQuery,
                };
            case 'columnTotal':
                return { ...this.buildColumnTotalQuery(), sourceQuery };
            case 'rowTotal':
                return { ...this.buildRowTotalQuery(), sourceQuery };
            case 'columnSubtotal':
                return { ...this.buildColumnSubtotalQuery(), sourceQuery };
            default:
                return assertUnreachable(
                    kind,
                    `Total query kind "${kind}" is not supported`,
                );
        }
    }

    private buildSourceQuery(): TotalQuerySourceQuery | undefined {
        const { kind, metricQuery, pivotConfiguration } = this.args;
        const needsSourceQuery =
            // Blocking filters are enforced by restricting raw rows to the
            // source groups that pass them.
            hasBlockingTotalFilters(metricQuery) ||
            // Subtotals pin to the grain groups on the visible page.
            kind === 'columnSubtotal' ||
            // Sum-of-rows calcs aggregate over the source rows.
            getSumOfRowsTableCalculations(metricQuery).length > 0;
        if (!needsSourceQuery) {
            return undefined;
        }
        return {
            metricQuery,
            pivotConfiguration: pivotConfiguration ?? undefined,
        };
    }

    // Strip a MetricQuery down to a one-row grand total. PoP metrics are
    // dropped because they require their time dim to be selected.
    private buildGrandTotalMetricQuery(): MetricQuery {
        const { metricQuery } = this.args;
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
            filters: hasBlockingTotalFilters(metricQuery)
                ? stripBlockingFilters(metricQuery.filters)
                : metricQuery.filters,
        };

        return totalQuery;
    }

    // Pivoted source: re-aggregate by `groupByColumns`, drop `indexColumn`.
    // Non-pivoted: delegate to the grand total (one row per metric).
    private buildColumnTotalQuery(): TotalQueryResult {
        const { metricQuery, pivotConfiguration } = this.args;
        const groupByColumns = pivotConfiguration?.groupByColumns ?? [];
        const isPivoted = !!pivotConfiguration && groupByColumns.length > 0;

        if (!isPivoted) {
            return {
                metricQuery: this.buildGrandTotalMetricQuery(),
                pivotConfiguration: undefined,
            };
        }

        const sourceDimensionIds = new Set(metricQuery.dimensions);
        const groupByFieldIds = groupByColumns.map((g) => g.reference);
        const missing = groupByFieldIds.filter(
            (id) => !sourceDimensionIds.has(id),
        );
        if (missing.length > 0) {
            throw new NotSupportedError(
                `Column total query references dimensions that were not in the source query: ${missing.join(', ')}`,
            );
        }

        // PoP entries would fail validation once the index dim is dropped.
        const popMetricIds = getPopMetricIds(metricQuery);
        const keptMetrics = metricQuery.metrics.filter(
            (id) => !popMetricIds.has(id),
        );
        const keptMetricIds = new Set(keptMetrics);
        const totalableCalcs = getTotalableTableCalculations(
            metricQuery,
            keptMetricIds,
        );

        const totalsMetricQuery: MetricQuery = {
            ...metricQuery,
            dimensions: groupByFieldIds,
            sorts: [],
            tableCalculations: totalableCalcs,
            metrics: keptMetrics,
            additionalMetrics: (metricQuery.additionalMetrics ?? []).filter(
                (am) => !isPeriodOverPeriodAdditionalMetric(am),
            ),
            filters: hasBlockingTotalFilters(metricQuery)
                ? stripBlockingFilters(metricQuery.filters)
                : metricQuery.filters,
        };

        const totalsPivotConfiguration: PivotConfiguration = {
            ...pivotConfiguration,
            // Drop index + index-scoped sort helpers; they have no meaning
            // once the pivot collapses to a single wide row.
            indexColumn: undefined,
            sortOnlyDimensions: undefined,
            valuesColumns: filterTotalsValuesColumns(
                pivotConfiguration.valuesColumns,
                keptMetricIds,
                totalableCalcs,
                getSumOfRowsTableCalculations(metricQuery),
            ),
        };

        return {
            metricQuery: totalsMetricQuery,
            pivotConfiguration: totalsPivotConfiguration,
        };
    }

    // Subtotals collapse the inner row dimensions while keeping the pivot
    // columns, so we re-run grouped by `subtotalDimensions` plus the pivot
    // `groupByColumns` and emit a flat (non-pivoted) result: one row per
    // subtotal-group × pivot value. Correct for every metric type. The treemap
    // (no pivot) case just groups by `subtotalDimensions`.
    private buildColumnSubtotalQuery(): TotalQueryResult {
        const { metricQuery, pivotConfiguration } = this.args;
        const subtotalDimensions = this.args.subtotalDimensions ?? [];
        if (subtotalDimensions.length === 0) {
            throw new NotSupportedError(
                'Column subtotals require at least one subtotal dimension',
            );
        }

        const groupByFieldIds = (pivotConfiguration?.groupByColumns ?? []).map(
            (g) => g.reference,
        );

        const sourceDimensionIds = new Set(metricQuery.dimensions);
        const missing = [...subtotalDimensions, ...groupByFieldIds].filter(
            (id) => !sourceDimensionIds.has(id),
        );
        if (missing.length > 0) {
            throw new NotSupportedError(
                `Column subtotal query references dimensions that were not in the source query: ${missing.join(', ')}`,
            );
        }

        const popMetricIds = getPopMetricIds(metricQuery);
        const keptMetrics = metricQuery.metrics.filter(
            (id) => !popMetricIds.has(id),
        );

        const subtotalMetricQuery: MetricQuery = {
            ...metricQuery,
            dimensions: [
                ...new Set([...subtotalDimensions, ...groupByFieldIds]),
            ],
            sorts: [],
            tableCalculations: getTotalableTableCalculations(
                metricQuery,
                new Set(keptMetrics),
            ),
            metrics: keptMetrics,
            additionalMetrics: (metricQuery.additionalMetrics ?? []).filter(
                (am) => !isPeriodOverPeriodAdditionalMetric(am),
            ),
            filters: hasBlockingTotalFilters(metricQuery)
                ? stripBlockingFilters(metricQuery.filters)
                : metricQuery.filters,
        };

        return {
            metricQuery: subtotalMetricQuery,
            pivotConfiguration: undefined,
        };
    }

    // Pivoted source: re-aggregate by `indexColumn`, drop `groupByColumns`.
    // Row totals are undefined for non-pivoted queries (each row already
    // carries its own metric values), so we reject that case explicitly.
    private buildRowTotalQuery(): TotalQueryResult {
        const { metricQuery, pivotConfiguration } = this.args;
        const groupByColumns = pivotConfiguration?.groupByColumns ?? [];
        const isPivoted = !!pivotConfiguration && groupByColumns.length > 0;

        if (!isPivoted) {
            throw new NotSupportedError(
                'Row totals are only supported for pivoted queries',
            );
        }

        const indexFieldIds = getIndexColumnFieldIds(
            pivotConfiguration.indexColumn,
        );
        if (indexFieldIds.length === 0) {
            return {
                metricQuery: this.buildGrandTotalMetricQuery(),
                pivotConfiguration: undefined,
            };
        }

        const sourceDimensionIds = new Set(metricQuery.dimensions);
        const missing = indexFieldIds.filter(
            (id) => !sourceDimensionIds.has(id),
        );
        if (missing.length > 0) {
            throw new NotSupportedError(
                `Row total query references dimensions that were not in the source query: ${missing.join(', ')}`,
            );
        }

        // PoP metrics are dropped to mirror the column-total path — they assume
        // a specific time-dim anchoring that may not survive the collapsed
        // pivot, and keeping the two transforms symmetric makes the contract
        // easier to reason about.
        const popMetricIds = getPopMetricIds(metricQuery);
        const keptMetrics = metricQuery.metrics.filter(
            (id) => !popMetricIds.has(id),
        );
        const keptMetricIds = new Set(keptMetrics);
        const totalableCalcs = getTotalableTableCalculations(
            metricQuery,
            keptMetricIds,
        );

        const totalsMetricQuery: MetricQuery = {
            ...metricQuery,
            dimensions: indexFieldIds,
            sorts: [],
            tableCalculations: totalableCalcs,
            metrics: keptMetrics,
            additionalMetrics: (metricQuery.additionalMetrics ?? []).filter(
                (am) => !isPeriodOverPeriodAdditionalMetric(am),
            ),
            filters: hasBlockingTotalFilters(metricQuery)
                ? stripBlockingFilters(metricQuery.filters)
                : metricQuery.filters,
        };

        // `groupByColumns: []` opts out of the pivot SQL path in
        // PivotQueryBuilder, so the totals query returns a flat shape:
        // one row per index-dim value combination with plain metric columns.
        // Keep only sorts on index columns: the collapsed query no longer selects
        // pivot/groupBy dimensions and exposes metrics under an `_any` alias, so any
        // other sort reference would produce an ORDER BY on a non-existent column.
        // Row totals are matched by index key, not order, so this is safe.
        const indexFieldIdSet = new Set(indexFieldIds);
        const totalsPivotConfiguration: PivotConfiguration = {
            ...pivotConfiguration,
            groupByColumns: [],
            sortBy: pivotConfiguration.sortBy?.filter((sort) =>
                indexFieldIdSet.has(sort.reference),
            ),
            sortOnlyDimensions: undefined,
            passthroughDimensions: undefined,
            valuesColumns: filterTotalsValuesColumns(
                pivotConfiguration.valuesColumns,
                keptMetricIds,
                totalableCalcs,
                getSumOfRowsTableCalculations(metricQuery),
            ),
        };

        return {
            metricQuery: totalsMetricQuery,
            pivotConfiguration: totalsPivotConfiguration,
        };
    }
}
