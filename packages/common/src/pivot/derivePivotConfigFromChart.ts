/**
 * Derives pivot configuration from a saved chart's configuration and metric query
 * This enables consistent pivoting across all chart types
 */
import {
    CustomDimensionType,
    DimensionType,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    TableCalculationType,
    type ItemsMap,
} from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import type { PivotConfig, PivotConfiguration } from '../types/pivot';
import {
    ChartType,
    getHiddenTableFields,
    isCartesianChartConfig,
    type SavedChartDAO,
} from '../types/savedCharts';
import assertUnreachable from '../utils/assertUnreachable';
import {
    getColumnAxisType,
    getTableCalculationAxisType,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '../visualizations/types';
import { normalizeIndexColumns } from './utils';

function getSortByForPivotConfiguration(
    partialPivot: Omit<PivotConfiguration, 'sortBy'>,
    metricQuery: MetricQuery,
): NonNullable<PivotConfiguration['sortBy']> | undefined {
    const {
        groupByColumns,
        indexColumn,
        valuesColumns,
        sortOnlyColumns,
        sortOnlyDimensions,
    } = partialPivot;

    const sortBy = metricQuery.sorts
        .map<NonNullable<PivotConfiguration['sortBy']>[number] | undefined>(
            (sort) => {
                const isGroupByColumn = groupByColumns?.some(
                    (col) => col.reference === sort.fieldId,
                );

                const isIndexColumn = normalizeIndexColumns(indexColumn).some(
                    (col) => col.reference === sort.fieldId,
                );

                const isValueColumn = valuesColumns?.some(
                    (col) => col.reference === sort.fieldId,
                );

                const isSortOnlyColumn = sortOnlyColumns?.some(
                    (col) => col.reference === sort.fieldId,
                );

                const isSortOnlyDimension = sortOnlyDimensions?.some(
                    (col) => col.reference === sort.fieldId,
                );

                // Include sort if the field is present in any part of the pivot configuration
                if (
                    isGroupByColumn ||
                    isIndexColumn ||
                    isValueColumn ||
                    isSortOnlyColumn ||
                    isSortOnlyDimension
                ) {
                    return {
                        reference: sort.fieldId,
                        direction: sort.descending
                            ? SortByDirection.DESC
                            : SortByDirection.ASC,
                        nullsFirst: sort.nullsFirst,
                        pivotValues: sort.pivotValues,
                    };
                }

                return undefined;
            },
        )
        .filter((sort): sort is NonNullable<typeof sort> => sort !== undefined);

    if (sortBy.length === 0) {
        return undefined;
    }

    return sortBy;
}

const getIndexColumn = (
    groupByColumns: PivotConfiguration['groupByColumns'],
    valuesColumns: PivotConfiguration['valuesColumns'],
    fields: ItemsMap,
    metricQuery: MetricQuery,
    xField?: string,
) => {
    const groupByColumnsReferences =
        groupByColumns?.map((c) => c.reference) ?? [];
    const valuesColumnsReferences =
        valuesColumns?.map((c) => c.reference) ?? [];
    const sortFieldIds = new Set(metricQuery.sorts.map((s) => s.fieldId));

    // Find any columns that are not groupBy or value columns (these become index columns)
    // Table calculations are only included if they are the xField (used as the x-axis dimension)
    // or if they are used in sorting. Otherwise we don't want to include them as multiple
    // index columns cause multiple series.
    const tableCalcNames = (metricQuery.tableCalculations || [])
        .filter((tc) => tc.name === xField || sortFieldIds.has(tc.name))
        .map((tc) => tc.name);

    const indexColumnNames = [
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...tableCalcNames,
    ].filter(
        (dim) =>
            !groupByColumnsReferences.includes(dim) &&
            !valuesColumnsReferences.includes(dim),
    );

    return indexColumnNames
        .map((dim) => {
            const field = fields[dim];

            if (!field) return undefined;

            if (isDimension(field)) {
                return {
                    reference: dim,
                    type: getColumnAxisType(field.type),
                };
            }

            if (isCustomDimension(field)) {
                // For SQL custom dimensions, use provided dimensionType; otherwise default to CATEGORY
                const axisType =
                    field.type === CustomDimensionType.SQL
                        ? getColumnAxisType(field.dimensionType)
                        : getColumnAxisType(DimensionType.STRING);

                return {
                    reference: dim,
                    type: axisType,
                };
            }

            // Table calculations can be used in x axis, therefore we need to handle them here as well when they're not a value column
            if (isTableCalculation(field)) {
                return {
                    reference: dim,
                    type: getTableCalculationAxisType(
                        field.type ?? TableCalculationType.NUMBER,
                    ),
                };
            }

            // Metrics can be used as x-axis in scatter charts, so we need to handle them as index columns
            // Only include metrics if they are explicitly the x-axis field, otherwise they would
            // incorrectly become index columns and break pivoted charts (e.g., stacked bar charts)
            if (isMetric(field) && dim === xField) {
                return {
                    reference: dim,
                    type: VizIndexType.CATEGORY,
                };
            }

            return undefined;
        })
        .filter((col): col is NonNullable<typeof col> => col !== undefined);
};

function getTablePivotConfiguration(
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    metricQuery: MetricQuery,
    fields: ItemsMap,
): PivotConfiguration | undefined {
    const { chartConfig, pivotConfig } = savedChart;

    if (chartConfig.type !== ChartType.TABLE) {
        throw new Error('Chart is not a table');
    }

    if (!pivotConfig) {
        return undefined;
    }

    // Create value columns for each metric and table calculation
    const valuesColumns = [
        ...metricQuery.metrics.map((metric) => ({
            reference: metric,
            aggregation: VizAggregationOptions.ANY,
        })),
        ...(metricQuery.tableCalculations || []).map((tc) => ({
            reference: tc.name,
            aggregation: VizAggregationOptions.ANY,
        })),
    ].filter(
        (col) =>
            metricQuery.dimensions.includes(col.reference) ||
            metricQuery.metrics.includes(col.reference) ||
            (metricQuery.tableCalculations || []).some(
                (tc) => tc.name === col.reference,
            ),
    );

    const pivotColumns = pivotConfig.columns || [];

    // Identify hidden dimensions (visible: false in columnProperties).
    // ANY hidden dim is excluded from indexColumn / groupByColumns.
    // Hidden pivot-column dims are routed three ways:
    //   - sorted → sortOnlyDimensions (drive column ORDER BY)
    //   - not sorted → passthroughDimensions (carry values through GROUP BY so
    //     other fields' richText/image templates can read them via `row.*.raw`)
    // Hidden row-index dims still drop to sortOnlyColumns or are excluded
    // entirely from indexColumn.
    const hiddenFieldIds = getHiddenTableFields(chartConfig);
    const sortFieldIds = new Set(metricQuery.sorts.map((s) => s.fieldId));

    // Group by columns are the pivot dimensions — exclude hidden ones.
    // Hidden pivot-column dims are routed to either sortOnlyDimensions (if
    // sorted) or passthroughDimensions (if not sorted) — never dropped, so
    // cross-field templates that reference them keep working.
    const allPivotGroupByColumns = pivotColumns
        .map((col: string) => ({
            reference: col,
        }))
        .filter((col) => metricQuery.dimensions.includes(col.reference));

    const groupByColumns = allPivotGroupByColumns.filter(
        (col) => !hiddenFieldIds.includes(col.reference),
    );

    // Hidden pivot-column dims that are also sorted → kept for column ORDER BY
    // via sortOnlyDimensions. They drive column sort order but are not spread
    // as pivot column headers.
    const sortOnlyPivotDimensions = allPivotGroupByColumns
        .filter(
            (col) =>
                hiddenFieldIds.includes(col.reference) &&
                sortFieldIds.has(col.reference),
        )
        .map((col) => ({ reference: col.reference }));

    // Hidden pivot-column dims that are NOT sorted → carried through SQL as
    // passthrough data so other visible fields' richText / image templates
    // can reference them via `row.<table>.<field>.raw`. Without this routing
    // these dims would be dropped entirely and the template reference would
    // silently resolve to undefined.
    const passthroughPivotDimensions = allPivotGroupByColumns
        .filter(
            (col) =>
                hiddenFieldIds.includes(col.reference) &&
                !sortFieldIds.has(col.reference),
        )
        .map((col) => ({ reference: col.reference }));

    // Declared order of pivot-column dims that drive column ORDER BY: visible
    // groupByColumns + hidden sortOnlyDimensions, in their declared
    // (pivotConfig.columns) order. Passthrough dims are excluded (they don't
    // sort). PivotQueryBuilder orders columns by this so a hidden sort dim sorts
    // at its declared position — hiding it preserves the visible column order.
    const passthroughPivotRefs = new Set(
        passthroughPivotDimensions.map((c) => c.reference),
    );
    const pivotColumnsOrder = allPivotGroupByColumns.filter(
        (col) => !passthroughPivotRefs.has(col.reference),
    );

    const groupByRefs = new Set([
        ...groupByColumns.map((c) => c.reference),
        ...sortOnlyPivotDimensions.map((c) => c.reference),
        ...passthroughPivotDimensions.map((c) => c.reference),
    ]);

    // All hidden dims that are NOT pivot-column dims (i.e., row-index dims).
    // These are excluded from indexColumn.
    const allHiddenDimRefs = new Set(
        metricQuery.dimensions.filter(
            (d) => hiddenFieldIds.includes(d) && !groupByRefs.has(d),
        ),
    );

    // Subset of hidden row-index dims that are also sorted → participate in SQL
    // via sortOnlyColumns (merged into valuesColumns for the group_by_query).
    const sortOnlyRowDimensions = metricQuery.dimensions
        .filter((d) => allHiddenDimRefs.has(d) && sortFieldIds.has(d))
        .map((d) => ({
            reference: d,
            aggregation: VizAggregationOptions.ANY,
        }));

    // Hidden row-index dims that are NOT sorted → carried through SQL via
    // passthroughDimensions (same mechanism as hidden pivot-column dims).
    // They survive group_by_query GROUP BY so their per-row value reaches
    // result rows for cross-field richText / image templates. Don't render
    // as an index column. Assumes 1-to-1 cardinality with the visible row
    // dims (the typical case: an `image_url` derived from `status`).
    const passthroughRowDimensions = metricQuery.dimensions
        .filter(
            (d) =>
                allHiddenDimRefs.has(d) &&
                !sortFieldIds.has(d) &&
                // Don't double-route if already a sortOnly row dim
                !sortOnlyRowDimensions.some((s) => s.reference === d),
        )
        .map((d) => ({ reference: d }));

    // When computing index columns, treat ALL hidden dims the same as value columns
    // so they are excluded from indexColumn (preventing them from rendering as
    // row-index columns). This covers both sort-only hidden dims and hidden dims
    // that are not sorted at all.
    const hiddenDimPlaceholders = [...allHiddenDimRefs].map((d) => ({
        reference: d,
        aggregation: VizAggregationOptions.ANY,
    }));
    const allValuesColumnsForIndex = [
        ...valuesColumns,
        ...hiddenDimPlaceholders,
    ];

    // Also exclude hidden pivot-column dims from indexColumn by treating them as
    // group-by columns from getIndexColumn's perspective.
    const allGroupByColumnsForIndex = [
        ...groupByColumns,
        ...sortOnlyPivotDimensions,
        ...passthroughPivotDimensions,
    ];

    // Find columns that are not groupBy or value columns (these become index columns)
    const indexColumn = getIndexColumn(
        allGroupByColumnsForIndex,
        allValuesColumnsForIndex,
        fields,
        metricQuery,
    );

    const partialPivotConfiguration: Omit<PivotConfiguration, 'sortBy'> = {
        indexColumn,
        valuesColumns,
        groupByColumns,
        ...(sortOnlyRowDimensions.length > 0 && {
            sortOnlyColumns: sortOnlyRowDimensions,
        }),
        ...(sortOnlyPivotDimensions.length > 0 && {
            sortOnlyDimensions: sortOnlyPivotDimensions,
            pivotColumnsOrder,
        }),
        ...((passthroughPivotDimensions.length > 0 ||
            passthroughRowDimensions.length > 0) && {
            passthroughDimensions: [
                ...passthroughPivotDimensions,
                ...passthroughRowDimensions,
            ],
        }),
    };

    const pivotConfiguration: PivotConfiguration = {
        ...partialPivotConfiguration,
        sortBy: getSortByForPivotConfiguration(
            partialPivotConfiguration,
            metricQuery,
        ),
        // Pass metricsAsRows from table chart config for accurate column limit calculation
        metricsAsRows: chartConfig.config?.metricsAsRows,
    };

    return pivotConfiguration;
}

function getCartesianPivotConfiguration(
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    metricQuery: MetricQuery,
    fields: ItemsMap,
): PivotConfiguration | undefined {
    const { chartConfig, pivotConfig } = savedChart;

    if (chartConfig.type !== ChartType.CARTESIAN) {
        throw new Error('Chart is not a Cartesian chart');
    }

    if (!isCartesianChartConfig(chartConfig.config)) {
        throw new Error('Invalid cartesian chart config - no eCharts config');
    }

    const {
        layout: { xField, yField },
    } = chartConfig.config;

    if (pivotConfig?.columns && xField && yField) {
        // Extract and validate pivot columns
        const groupByColumns = pivotConfig.columns
            .map((pv) => ({
                reference: pv,
            }))
            .filter((col) => metricQuery.dimensions.includes(col.reference));

        // Extract value columns (metrics and table calculations from yField)
        const valuesColumns = yField
            .map((yf) => ({
                reference: yf,
                aggregation: VizAggregationOptions.ANY,
            }))
            .filter(
                (col) =>
                    metricQuery.dimensions.includes(col.reference) ||
                    metricQuery.metrics.includes(col.reference) ||
                    (metricQuery.tableCalculations || []).some(
                        (tc) => tc.name === col.reference,
                    ),
            );

        // Include metrics/table calculations that are used in sorts but not
        // displayed in the chart. Without these in valuesColumns, the sort
        // is silently dropped and PivotQueryBuilder can't generate anchor CTEs.
        const valuesRefs = new Set(valuesColumns.map((c) => c.reference));
        const sortOnlyMetrics = metricQuery.sorts
            .filter(
                (sort) =>
                    sort.fieldId !== xField &&
                    !valuesRefs.has(sort.fieldId) &&
                    (metricQuery.metrics.includes(sort.fieldId) ||
                        (metricQuery.tableCalculations || []).some(
                            (tc) => tc.name === sort.fieldId,
                        )),
            )
            .map((sort) => ({
                reference: sort.fieldId,
                aggregation: VizAggregationOptions.ANY,
            }));

        // Find columns that are not groupBy or value columns (these become index columns)
        // Include sortOnlyMetrics in the valuesColumns passed to getIndexColumn
        // so they aren't incorrectly classified as index columns.
        const allValuesColumns = [...valuesColumns, ...sortOnlyMetrics];
        const indexColumn = getIndexColumn(
            groupByColumns,
            allValuesColumns,
            fields,
            metricQuery,
            xField,
        );

        const partialPivotConfiguration: Omit<PivotConfiguration, 'sortBy'> = {
            indexColumn,
            valuesColumns,
            groupByColumns,
            ...(sortOnlyMetrics.length > 0 && {
                sortOnlyColumns: sortOnlyMetrics,
            }),
        };

        const pivotConfiguration: PivotConfiguration = {
            ...partialPivotConfiguration,
            sortBy: getSortByForPivotConfiguration(
                partialPivotConfiguration,
                metricQuery,
            ),
        };

        return pivotConfiguration;
    }
    return undefined;
}

function isValid(pivotConfiguration: PivotConfiguration): boolean {
    const { groupByColumns, valuesColumns, indexColumn } = pivotConfiguration;

    const indexColumns = normalizeIndexColumns(indexColumn);

    if (valuesColumns.length === 0) {
        return false;
    }

    if (!groupByColumns || groupByColumns.length === 0) {
        return false;
    }

    // Validate that no groupBy column is also part of the index columns
    const indexRefs = new Set(indexColumns.map((c) => c.reference));
    const overlapping = groupByColumns
        .map((c) => c.reference)
        .filter((ref) => indexRefs.has(ref));
    if (overlapping.length > 0) {
        return false;
    }

    return true;
}

export function derivePivotConfigurationFromChart(
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    metricQuery: MetricQuery,
    fields: ItemsMap,
): PivotConfiguration | undefined {
    const { chartConfig } = savedChart;
    const { type } = chartConfig;

    let newConfig: PivotConfiguration | undefined;
    switch (type) {
        case ChartType.TABLE:
            newConfig = getTablePivotConfiguration(
                savedChart,
                metricQuery,
                fields,
            );
            break;
        case ChartType.CARTESIAN:
            newConfig = getCartesianPivotConfiguration(
                savedChart,
                metricQuery,
                fields,
            );
            break;
        case ChartType.PIE:
        case ChartType.FUNNEL:
        case ChartType.TREEMAP:
        case ChartType.GAUGE:
        case ChartType.CUSTOM:
        case ChartType.BIG_NUMBER:
        case ChartType.MAP:
        case ChartType.SANKEY:
            newConfig = undefined;
            break;
        default:
            return assertUnreachable(type, `Unknown chart type ${type}`);
    }

    // Validate pivot configuration
    if (newConfig && isValid(newConfig)) {
        return newConfig;
    }

    return undefined;
}

/**
 * Derives a PivotConfiguration from a PivotConfig (the lightweight UI config)
 * without requiring a full SavedChartDAO shape. Use this when you have a PivotConfig
 * from a non-chart context (e.g. ad-hoc exports).
 */
export function derivePivotConfigurationFromPivotConfig(
    pivotConfig: PivotConfig,
    metricQuery: MetricQuery,
    fields: ItemsMap,
): PivotConfiguration | undefined {
    return derivePivotConfigurationFromChart(
        {
            chartConfig: {
                type: ChartType.TABLE,
                config: { metricsAsRows: pivotConfig.metricsAsRows },
            },
            pivotConfig: { columns: pivotConfig.pivotDimensions },
        },
        metricQuery,
        fields,
    );
}
