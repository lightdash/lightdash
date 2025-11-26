/**
 * Derives pivot configuration from a saved chart's configuration and metric query
 * This enables consistent pivoting across all chart types
 */
import {
    CustomDimensionType,
    DimensionType,
    isCustomDimension,
    isDimension,
    isTableCalculation,
    TableCalculationType,
    type ItemsMap,
} from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import type { PivotConfiguration } from '../types/pivot';

import {
    ChartType,
    isCartesianChartConfig,
    type SavedChartDAO,
} from '../types/savedCharts';
import assertUnreachable from '../utils/assertUnreachable';
import {
    getColumnAxisType,
    getTableCalculationAxisType,
    SortByDirection,
    VizAggregationOptions,
} from '../visualizations/types';
import { normalizeIndexColumns } from './utils';

function getSortByForPivotConfiguration(
    partialPivot: Omit<PivotConfiguration, 'sortBy'>,
    metricQuery: MetricQuery,
): NonNullable<PivotConfiguration['sortBy']> | undefined {
    const { groupByColumns, indexColumn, valuesColumns } = partialPivot;

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

                // Include sort if the field is present in any part of the pivot configuration
                if (isGroupByColumn || isIndexColumn || isValueColumn) {
                    return {
                        reference: sort.fieldId,
                        direction: sort.descending
                            ? SortByDirection.DESC
                            : SortByDirection.ASC,
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
) => {
    const groupByColumnsReferences =
        groupByColumns?.map((c) => c.reference) ?? [];
    const valuesColumnsReferences =
        valuesColumns?.map((c) => c.reference) ?? [];

    // Find any columns that are part of values or group by columns (these become index columns)
    const indexColumnNames = [
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...(metricQuery.tableCalculations || []).map((tc) => tc.name),
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

    // Group by columns are the pivot dimensions
    const groupByColumns = pivotColumns
        .map((col: string) => ({
            reference: col,
        }))
        .filter((col) => metricQuery.dimensions.includes(col.reference));

    // Find columns that are not groupBy or value columns (these become index columns)
    const indexColumn = getIndexColumn(
        groupByColumns,
        valuesColumns,
        fields,
        metricQuery,
    );

    const partialPivotConfiguration: Omit<PivotConfiguration, 'sortBy'> = {
        indexColumn,
        valuesColumns,
        groupByColumns,
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

        // Find columns that are not groupBy or value columns (these become index columns)
        const indexColumn = getIndexColumn(
            groupByColumns,
            valuesColumns,
            fields,
            metricQuery,
        );

        const partialPivotConfiguration: Omit<PivotConfiguration, 'sortBy'> = {
            indexColumn,
            valuesColumns,
            groupByColumns,
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
    if (indexColumns.length === 0) {
        return false;
    }

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
