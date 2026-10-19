import { type ItemsMap } from '../../../../types/field';
import { type ParametersValuesMap } from '../../../../types/parameters';
import { getFormattedValue } from '../../../../visualizations/helpers/valueFormatter';
import { type PivotValuesColumn } from '../../../../visualizations/types';
import { formatFieldLabel } from '../shared/formatFieldLabel';
import { type GetPivotedResultsFn } from './types';

// Mirrors the app's pivoted series names: formatted pivot values, prefixed with the metric when the chart plots several.
const getSeriesLabel = ({
    column,
    fieldsMap,
    parameters,
    timezone,
    isMultiMetric,
}: {
    column: PivotValuesColumn;
    fieldsMap: ItemsMap;
    parameters: ParametersValuesMap | null;
    timezone: string | null;
    isMultiMetric: boolean;
}): string => {
    const pivotLabel = column.pivotValues
        .map(({ referenceField, value }) =>
            getFormattedValue(
                value,
                referenceField,
                fieldsMap,
                undefined,
                undefined,
                parameters ?? undefined,
                timezone ?? undefined,
            ),
        )
        .join(' - ');
    return isMultiMetric
        ? `[${pivotLabel}] ${formatFieldLabel(column.referenceField, fieldsMap)}`
        : pivotLabel;
};

/** Feeds the chart builders rows the warehouse already pivoted. */
export const getWarehousePivotedResults =
    ({
        rows,
        fieldsMap,
        valuesColumns,
        parameters,
        timezone,
    }: {
        rows: Record<string, unknown>[];
        fieldsMap: ItemsMap;
        valuesColumns: PivotValuesColumn[];
        parameters: ParametersValuesMap | null;
        timezone: string | null;
    }): GetPivotedResultsFn =>
    async (_rows, _fieldsMap, _pivotFields, metrics, secondaryMetrics) => {
        const getColumns = (references: string[]) =>
            valuesColumns.filter(({ referenceField }) =>
                references.includes(referenceField),
            );
        const columns = getColumns(metrics);
        const secondaryColumns = getColumns(secondaryMetrics);
        const isMultiMetric = metrics.length + secondaryMetrics.length > 1;
        // ECharts reads dataset columns from the first row, and the warehouse omits empty pivot cells
        const emptyRow = Object.fromEntries(
            [...columns, ...secondaryColumns].map(({ pivotColumnName }) => [
                pivotColumnName,
                null,
            ]),
        );
        return {
            results: rows.map((row) => ({ ...emptyRow, ...row })),
            metrics: columns.map(({ pivotColumnName }) => pivotColumnName),
            secondaryMetrics: secondaryColumns.map(
                ({ pivotColumnName }) => pivotColumnName,
            ),
            labels: Object.fromEntries(
                [...columns, ...secondaryColumns].map((column) => [
                    column.pivotColumnName,
                    getSeriesLabel({
                        column,
                        fieldsMap,
                        parameters,
                        timezone,
                        isMultiMetric,
                    }),
                ]),
            ),
        };
    };
