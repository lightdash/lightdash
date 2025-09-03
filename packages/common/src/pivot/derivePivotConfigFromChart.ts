/**
 * Derives pivot configuration from a saved chart's configuration and metric query
 * This enables consistent pivoting across all chart types
 */
import { isDimension, type ItemsMap } from '../types/field';
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
    SortByDirection,
    VizAggregationOptions,
    type VizIndexType,
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

    const pivotColumns = pivotConfig.columns || [];

    // Find dimensions that are NOT being pivoted on (these become index columns)
    const nonPivotDimensions = metricQuery.dimensions.filter(
        (dim) => !pivotColumns.includes(dim),
    );

    const indexColumn = nonPivotDimensions
        .map((dim) => {
            const field = fields[dim];

            if (!field || !isDimension(field)) {
                return undefined;
            }

            return {
                reference: dim,
                type: getColumnAxisType(field.type),
            };
        })
        .filter((col): col is NonNullable<typeof col> => col !== undefined);

    // Create value columns for each metric
    const valuesColumns = metricQuery.metrics.map((metric) => ({
        reference: metric,
        aggregation: VizAggregationOptions.ANY,
    }));

    // Group by columns are the pivot dimensions
    const groupByColumns = pivotColumns.map((col: string) => ({
        reference: col,
    }));

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
        // Extract pivot columns
        const groupByColumns = pivotConfig.columns.map((pv) => ({
            reference: pv,
        }));

        // Extract value columns
        const valuesColumns = yField.map((yf) => ({
            reference: yf,
            aggregation: VizAggregationOptions.ANY,
        }));

        const xAxisDimension = fields[xField];
        let xAxisType: VizIndexType | undefined;

        if (xAxisDimension && isDimension(xAxisDimension)) {
            xAxisType = getColumnAxisType(xAxisDimension.type);
        }

        const indexColumn = xAxisType
            ? {
                  reference: xField,
                  type: xAxisType,
              }
            : undefined;

        const partialPivotConfiguration: Omit<PivotConfiguration, 'sortBy'> = {
            indexColumn,
            valuesColumns,
            groupByColumns,
        };

        return {
            ...partialPivotConfiguration,
            sortBy: getSortByForPivotConfiguration(
                partialPivotConfiguration,
                metricQuery,
            ),
        };
    }
    return undefined;
}

export function derivePivotConfigurationFromChart(
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    metricQuery: MetricQuery,
    fields: ItemsMap,
): PivotConfiguration | undefined {
    const { chartConfig } = savedChart;
    const { type } = chartConfig;

    switch (type) {
        case ChartType.TABLE:
            return getTablePivotConfiguration(savedChart, metricQuery, fields);
        case ChartType.CARTESIAN:
            return getCartesianPivotConfiguration(
                savedChart,
                metricQuery,
                fields,
            );
        case ChartType.PIE:
        case ChartType.FUNNEL:
        case ChartType.TREEMAP:
        case ChartType.CUSTOM:
        case ChartType.BIG_NUMBER:
            return undefined;
        default:
            return assertUnreachable(type, `Unknown chart type ${type}`);
    }
}
