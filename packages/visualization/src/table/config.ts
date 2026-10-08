import {
    convertFormattedValue,
    getItemLabel,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    itemsInMetricQuery,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfig,
    type PivotData,
    type ReadyQueryResultsPage,
    type TableChart,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import uniq from 'lodash/uniq';
import { type VisualizationResults } from '../types';
import {
    resolvePivotRowFieldIds,
    shouldDisableMetricsAsRows,
} from './pivotRows';
import { canHaveWarehouseTotal } from './totals';

/** The ids of every item the metric query selects, in query order. */
export const getTableSelectedItemIds = (
    metricQuery: MetricQuery | undefined,
): string[] | undefined =>
    metricQuery ? itemsInMetricQuery(metricQuery) : undefined;

/**
 * Whether a table with no saved `showTableNames` should show them: it does as
 * soon as the items come from a table. (The reduce keeps the frontend's
 * historical `> 0` check, so one table is enough.)
 */
export const shouldDefaultShowTableNames = (itemsMap: ItemsMap): boolean =>
    Object.values(itemsMap).reduce<string[]>((acc, item) => {
        if (isField(item)) {
            acc.push(item.table);
        }
        return uniq(acc);
    }, []).length > 0;

export const getTableFieldLabelDefault = (
    itemsMap: ItemsMap | undefined,
    showTableNames: boolean,
    fieldId: string | null | undefined,
): string | undefined => {
    if (!fieldId || !itemsMap || !(fieldId in itemsMap)) return undefined;

    const item = itemsMap[fieldId];

    if (isField(item) && !showTableNames) {
        return item.label;
    }
    return getItemLabel(item);
};

export const getTableFieldLabelOverride = (
    columnProperties: Record<string, ColumnProperties>,
    fieldId: string | null | undefined,
): string | undefined =>
    fieldId ? columnProperties[fieldId]?.name : undefined;

export const getTableFieldLabel = (
    itemsMap: ItemsMap | undefined,
    columnProperties: Record<string, ColumnProperties>,
    showTableNames: boolean,
    fieldId: string | null | undefined,
): string | undefined =>
    getTableFieldLabelOverride(columnProperties, fieldId) ||
    getTableFieldLabelDefault(itemsMap, showTableNames, fieldId);

export const isTableColumnVisible = (
    columnProperties: Record<string, ColumnProperties>,
    fieldId: string,
): boolean => columnProperties[fieldId]?.visible ?? true;

export const isTableColumnFrozen = (
    columnProperties: Record<string, ColumnProperties>,
    fieldId: string,
): boolean => columnProperties[fieldId]?.frozen === true;

export const getTableColumnWidth = (
    columnProperties: Record<string, ColumnProperties>,
    fieldId: string,
): number | undefined => columnProperties[fieldId]?.width;

export const isPivotTableEnabled = (
    resultsData: VisualizationResults | undefined,
    pivotDimensions: string[] | undefined,
) =>
    resultsData?.metricQuery &&
    resultsData.metricQuery.metrics.length > 0 &&
    resultsData.rows.length &&
    pivotDimensions &&
    pivotDimensions.length > 0;

// True when the configured pivot dimensions differ from the ones the current
// results were computed with (warehouse pivots key on groupByColumns). Mirrors
// the mismatch check in VisualizationWarning so a re-run is needed.
export const isPivotResultStale = (
    pivotDimensions: string[] | undefined,
    groupByColumns:
        | NonNullable<ReadyQueryResultsPage['pivotDetails']>['groupByColumns']
        | undefined,
    isColumnVisible: (fieldId: string) => boolean,
): boolean => {
    const resultsPivotDimensions =
        groupByColumns?.map((col) => col.reference) ?? [];
    // Compare only VISIBLE configured dims — a hidden sort-only pivot dim is
    // routed to sortOnlyDimensions and never appears in results.groupByColumns,
    // so including it here would keep the re-run prompt permanently stale.
    const visiblePivotDimensions = (pivotDimensions ?? []).filter(
        isColumnVisible,
    );
    return !isEqual(visiblePivotDimensions, resultsPivotDimensions);
};

/** The dimension (and custom dimension) ids of the column order. */
export const getTableDimensions = (
    columnOrder: string[],
    itemsMap: ItemsMap | undefined,
): string[] => {
    if (!itemsMap) return [];

    return columnOrder.filter((fieldId) => {
        const item = itemsMap[fieldId];
        return item && (isDimension(item) || isCustomDimension(item));
    });
};

export const getNumUnpivotedDimensions = (
    dimensions: string[],
    pivotDimensions: string[] | undefined,
): number => dimensions.length - (pivotDimensions?.length || 0);

// Subtotals re-derive from the metric query behind the source query. A
// merge has no such query — its metric query describes the merged result
// rather than anything the warehouse can be asked to group again.
export const canUseTableSubtotals = (
    numUnpivotedDimensions: number,
    isMerged: boolean,
): boolean => numUnpivotedDimensions > 1 && !isMerged;

// Once dimensions are loaded, turn off subtotals if there are not enough dimensions.
export const shouldDisableSubtotals = (
    dimensionsCount: number,
    numUnpivotedDimensions: number,
): boolean => dimensionsCount > 0 && numUnpivotedDimensions < 2;

// A dimension-only table has nothing the warehouse can total; skip the
// request instead of letting the backend refuse it.
export const hasTotalableColumns = (
    columnOrder: string[],
    itemsMap: ItemsMap | undefined,
): boolean =>
    columnOrder.some((fieldId) => canHaveWarehouseTotal(itemsMap?.[fieldId]));

// Index dimension field ids the warehouse row-total query groups by — the
// worker keys each rendered row's total by these. Row totals are exclusively
// warehouse-computed (no client-side fallback) for SQL pivots, in both the
// metrics-as-columns and metrics-as-rows layouts.
export const getRowTotalIndexFieldIds = (
    indexColumn:
        | NonNullable<ReadyQueryResultsPage['pivotDetails']>['indexColumn']
        | undefined,
): string[] => {
    if (!indexColumn) return [];
    return Array.isArray(indexColumn)
        ? indexColumn.map((col) => col.reference)
        : [indexColumn.reference];
};

/** What a table pivot hands to `convertSqlPivotedRowsToPivotData`. */
export type TablePivotInput = {
    rows: VisualizationResults['rows'];
    pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>;
    pivotConfig: PivotConfig;
    getField: (fieldId: string) => ItemsMap[string] | undefined;
    getFieldLabel: (fieldId: string) => string | undefined;
    groupedSubtotals: Record<string, Record<string, number>[]> | undefined;
    groupedRowSubtotals: PivotData['groupedRowSubtotals'] | undefined;
    warehouseRowTotals: Record<string, Record<string, number>> | undefined;
    warehouseColumnTotals: Record<string, number> | undefined;
    warehouseGrandTotals: Record<string, number> | undefined;
    parameters: ParametersValuesMap | undefined;
};

export type TablePivotInputArgs = {
    pivotDimensions: string[] | undefined;
    rows: VisualizationResults['rows'] | undefined;
    metricQuery: MetricQuery | undefined;
    pivotDetails: VisualizationResults['pivotDetails'];
    selectedItemIds: string[] | undefined;
    getField: (fieldId: string) => ItemsMap[string] | undefined;
    getFieldLabel: (fieldId: string) => string | undefined;
    isColumnVisible: (fieldId: string) => boolean;
    metricsAsRows: boolean;
    rowFieldIds: string[];
    columnOrder: string[];
    showColumnCalculation: boolean | undefined;
    showRowCalculation: boolean | undefined;
    groupedSubtotals?: Record<string, Record<string, number>[]>;
    groupedRowSubtotals?: PivotData['groupedRowSubtotals'];
    warehouseRowTotals?: Record<string, Record<string, number>>;
    warehouseColumnTotals?: Record<string, number>;
    warehouseGrandTotals?: Record<string, number>;
    parameters?: ParametersValuesMap;
};

/**
 * The input of the pivot conversion, or null when the results are not a
 * pivot. The frontend runs the conversion in a web worker; a headless caller
 * passes this to `convertSqlPivotedRowsToPivotData` directly.
 */
export const buildTablePivotInput = ({
    pivotDimensions,
    rows,
    metricQuery,
    pivotDetails,
    selectedItemIds,
    getField,
    getFieldLabel,
    isColumnVisible,
    metricsAsRows,
    rowFieldIds,
    columnOrder,
    showColumnCalculation,
    showRowCalculation,
    groupedSubtotals,
    groupedRowSubtotals,
    warehouseRowTotals,
    warehouseColumnTotals,
    warehouseGrandTotals,
    parameters,
}: TablePivotInputArgs): TablePivotInput | null => {
    if (
        !pivotDimensions ||
        pivotDimensions.length === 0 ||
        !metricQuery ||
        !rows ||
        rows.length === 0
    ) {
        return null;
    }

    const hiddenMetricFieldIds = selectedItemIds?.filter((fieldId) => {
        const field = getField(fieldId);

        return (
            !isColumnVisible(fieldId) &&
            field &&
            ((isField(field) && isMetric(field)) || isTableCalculation(field))
        );
    });

    const hiddenDimensionFieldIds = selectedItemIds?.filter((fieldId) => {
        const field = getField(fieldId);
        if (!field || isColumnVisible(fieldId)) return false;
        // Custom SQL dimensions are not `Field`s but still behave as dims
        // in the pivot (driving sort order via sortOnlyDimensions).
        return (
            (isField(field) && isDimension(field)) || isCustomDimension(field)
        );
    });

    const pivotConfig: PivotConfig = {
        pivotDimensions,
        metricsAsRows,
        rowFieldIds,
        columnOrder,
        hiddenMetricFieldIds,
        hiddenDimensionFieldIds,
        columnTotals: showColumnCalculation,
        rowTotals: showRowCalculation,
    };

    if (!pivotDetails) {
        return null;
    }

    return {
        rows,
        pivotDetails,
        pivotConfig,
        getField,
        getFieldLabel,
        groupedSubtotals,
        groupedRowSubtotals,
        warehouseRowTotals,
        warehouseColumnTotals,
        warehouseGrandTotals,
        parameters,
    };
};

// Remove columnProperties from map if the column has been removed from results
export const pruneTableColumnProperties = (
    columnProperties: Record<string, ColumnProperties>,
    selectedItemIds: string[],
): Record<string, ColumnProperties> =>
    Object.keys(columnProperties).reduce<Record<string, ColumnProperties>>(
        (acc, field) =>
            selectedItemIds.includes(field)
                ? {
                      ...acc,
                      [field]: columnProperties[field],
                  }
                : acc,
        {},
    );

// Step 1: Identify which fields need min/max calculation
export const getFieldsNeedingMinMax = (
    conditionalFormattings: ConditionalFormattingConfig[] | undefined,
    columnProperties: Record<string, ColumnProperties>,
): Set<string> => {
    const fieldsNeedingMinMax = new Set<string>();

    conditionalFormattings?.forEach((config) => {
        if (config.target) {
            fieldsNeedingMinMax.add(config.target.fieldId);
        }
    });

    Object.entries(columnProperties).forEach(([fieldId, props]) => {
        if (props.displayStyle === 'bar') {
            fieldsNeedingMinMax.add(fieldId);
        }
    });

    return fieldsNeedingMinMax;
};

/**
 * The min and max of every numeric field a conditional format or bar display
 * reads, across the result rows (and across a field's pivot columns when the
 * results are a SQL pivot). Undefined when nothing needs one.
 */
export const calculateConditionalFormattingMinMaxMap = ({
    fieldsNeedingMinMax,
    itemsMap,
    resultsData,
    isColumnVisible,
}: {
    fieldsNeedingMinMax: Set<string>;
    itemsMap: ItemsMap;
    resultsData: VisualizationResults;
    isColumnVisible: (fieldId: string) => boolean;
}): ConditionalFormattingMinMaxMap | undefined => {
    // Step 3: Build field-to-columns mapping
    // For SQL pivots: Maps base field (e.g., "revenue") to pivot columns (e.g., ["revenue_bank", "revenue_paypal"])
    // For non-pivots: Direct 1:1 mapping (e.g., "revenue" → ["revenue"])
    const fieldColumnMapping = new Map<string, string[]>();

    for (const fieldId of fieldsNeedingMinMax) {
        if (!isColumnVisible(fieldId)) continue;

        const field = itemsMap[fieldId];
        if (!field || !isNumericItem(field)) continue;

        if (!resultsData.pivotDetails) {
            fieldColumnMapping.set(fieldId, [fieldId]);
        } else {
            const pivotColumnNames = resultsData.pivotDetails.valuesColumns
                .filter((col) => col.referenceField === fieldId)
                .map((col) => col.pivotColumnName);
            if (pivotColumnNames.length > 0) {
                fieldColumnMapping.set(fieldId, pivotColumnNames);
            }
        }
    }

    if (fieldColumnMapping.size === 0) {
        return undefined;
    }

    // Step 4: Single-pass collection of all values
    const fieldValues = new Map<string, number[]>();
    for (const fieldId of fieldColumnMapping.keys()) {
        fieldValues.set(fieldId, []);
    }

    for (const row of resultsData.rows) {
        for (const [fieldId, columnNames] of fieldColumnMapping.entries()) {
            const values = fieldValues.get(fieldId) ?? [];
            const field = itemsMap[fieldId];

            for (const columnName of columnNames) {
                const rawValue = row[columnName]?.value?.raw;
                if (
                    rawValue !== undefined &&
                    rawValue !== null &&
                    rawValue !== ''
                ) {
                    const numValue = Number(rawValue);
                    if (!Number.isNaN(numValue)) {
                        values.push(convertFormattedValue(numValue, field));
                    }
                }
            }

            // Update the values for the field
            fieldValues.set(fieldId, values);
        }
    }

    // Step 5: Calculate min/max for each field
    const result: ConditionalFormattingMinMaxMap = {};
    for (const [fieldId, values] of fieldValues.entries()) {
        if (values.length > 0) {
            result[fieldId] = {
                min: Math.min(...values),
                max: Math.max(...values),
            };
        }
    }

    return Object.keys(result).length > 0 ? result : undefined;
};

/** One-shot, cache-free version of the frontend's `minMaxMap` memo. */
export const getConditionalFormattingMinMaxMap = ({
    itemsMap,
    resultsData,
    conditionalFormattings,
    columnProperties,
}: {
    itemsMap: ItemsMap | undefined;
    resultsData: VisualizationResults | undefined;
    conditionalFormattings: ConditionalFormattingConfig[] | undefined;
    columnProperties: Record<string, ColumnProperties>;
}): ConditionalFormattingMinMaxMap | undefined => {
    if (!itemsMap || !resultsData || resultsData.rows.length === 0) {
        return undefined;
    }
    const fieldsNeedingMinMax = getFieldsNeedingMinMax(
        conditionalFormattings,
        columnProperties,
    );
    if (fieldsNeedingMinMax.size === 0) {
        return undefined;
    }
    return calculateConditionalFormattingMinMaxMap({
        fieldsNeedingMinMax,
        itemsMap,
        resultsData,
        isColumnVisible: (fieldId) =>
            isTableColumnVisible(columnProperties, fieldId),
    });
};

export type ResolveTableChartConfigArgs = {
    chartConfig: TableChart | undefined;
    resultsData: VisualizationResults | undefined;
    itemsMap: ItemsMap | undefined;
    columnOrder: string[];
    pivotDimensions: string[] | undefined;
    pivotRows?: string[] | undefined;
    /** A merged result cannot have subtotals. */
    isMerged?: boolean;
};

export type ResolvedTableChartConfig = {
    validConfig: TableChart;
    selectedItemIds: string[] | undefined;
    rowFieldIds: string[];
    dimensions: string[];
    numUnpivotedDimensions: number;
    canUseSubtotals: boolean;
    hasTotalableColumns: boolean;
    isPivotTableEnabled: boolean;
    isPivotResultStale: boolean;
};

/**
 * The valid table config the editor hook settles on for a freshly mounted
 * chart: the saved config with the defaults and repairs its effects apply
 * once the items and results are known.
 */
export const resolveTableChartConfig = ({
    chartConfig,
    resultsData,
    itemsMap,
    columnOrder,
    pivotDimensions,
    pivotRows,
    isMerged = false,
}: ResolveTableChartConfigArgs): ResolvedTableChartConfig => {
    const selectedItemIds = getTableSelectedItemIds(resultsData?.metricQuery);

    let showTableNames = chartConfig?.showTableNames ?? false;
    if (chartConfig?.showTableNames === undefined && itemsMap !== undefined) {
        if (shouldDefaultShowTableNames(itemsMap)) {
            showTableNames = true;
        }
    }

    let columnProperties =
        chartConfig?.columns === undefined ? {} : chartConfig?.columns;
    if (Object.keys(columnProperties).length > 0 && selectedItemIds) {
        const newColumnProperties = pruneTableColumnProperties(
            columnProperties,
            selectedItemIds,
        );
        // only update if something changed, otherwise we get into an infinite loop
        if (
            Object.keys(columnProperties).length !==
            Object.keys(newColumnProperties).length
        ) {
            columnProperties = newColumnProperties;
        }
    }

    const rowFieldIds = resolvePivotRowFieldIds({
        selectedItemIds,
        itemsMap,
        pivotDimensions,
        columnOrder,
        pivotRows,
    });

    const metricsAsRows = chartConfig?.metricsAsRows || false;
    const disableMetricsAsRows = shouldDisableMetricsAsRows({
        metricsAsRows,
        selectedItemIds: selectedItemIds?.filter(
            (fieldId) => columnProperties[fieldId]?.visible !== false,
        ),
        rowFieldIds,
        itemsMap,
    });
    const effectiveMetricsAsRows = metricsAsRows && !disableMetricsAsRows;

    const dimensions = getTableDimensions(columnOrder, itemsMap);
    const numUnpivotedDimensions = getNumUnpivotedDimensions(
        dimensions,
        pivotDimensions,
    );
    const canUseSubtotals = canUseTableSubtotals(
        numUnpivotedDimensions,
        isMerged,
    );
    let showSubtotals = chartConfig?.showSubtotals ?? false;
    if (shouldDisableSubtotals(dimensions.length, numUnpivotedDimensions)) {
        showSubtotals = false;
    }

    const validConfig: TableChart = {
        showColumnCalculation: !!chartConfig?.showColumnCalculation,
        showRowCalculation: !!chartConfig?.showRowCalculation,
        showTableNames,
        showResultsTotal: chartConfig?.showResultsTotal ?? false,
        showSubtotals,
        showSubtotalsExpanded: chartConfig?.showSubtotalsExpanded ?? false,
        showRowGrouping: chartConfig?.showRowGrouping ?? false,
        columns: columnProperties,
        hideRowNumbers:
            chartConfig?.hideRowNumbers === undefined
                ? false
                : chartConfig.hideRowNumbers,
        // Only kept when on, so existing table configs stay unchanged
        ...(chartConfig?.hideMetricNames && { hideMetricNames: true }),
        conditionalFormattings: chartConfig?.conditionalFormattings ?? [],
        metricsAsRows: effectiveMetricsAsRows,
        rowLimit: chartConfig?.rowLimit,
    };

    return {
        validConfig,
        selectedItemIds,
        rowFieldIds,
        dimensions,
        numUnpivotedDimensions,
        canUseSubtotals,
        hasTotalableColumns: hasTotalableColumns(columnOrder, itemsMap),
        isPivotTableEnabled: !!isPivotTableEnabled(
            resultsData,
            pivotDimensions,
        ),
        isPivotResultStale: isPivotResultStale(
            pivotDimensions,
            resultsData?.pivotDetails?.groupByColumns,
            (fieldId) => isTableColumnVisible(columnProperties, fieldId),
        ),
    };
};
