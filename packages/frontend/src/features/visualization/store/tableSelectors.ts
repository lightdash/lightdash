import { type TableChart } from '@lightdash/common';
// Totals, subtotals, merge totals, the columns that render them, the pivot worker and the min/max cache stay in useTableConfig: they come from server queries
import {
    canUseTableSubtotals,
    getNumUnpivotedDimensions,
    getTableDimensions,
    getTableSelectedItemIds,
    hasTotalableColumns,
    isPivotResultStale,
    isPivotTableEnabled,
    isTableColumnVisible,
    pruneTableColumnProperties,
    resolvePivotRowFieldIds,
    shouldDefaultShowTableNames,
    shouldDisableMetricsAsRows,
    shouldDisableSubtotals,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import { selectTableEditor } from './selectors';

export type { TableToggleKey } from './tableEditorSlice';

type State = VisualizationStoreState;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
const inputsResults = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData;
const inputsMetricQuery = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData?.metricQuery;
const inputsColumnOrder = (_: State, inputs: VisualizationInputs) =>
    inputs.columnOrder;
const inputsPivotDimensions = (_: State, inputs: VisualizationInputs) =>
    inputs.pivotDimensions;
const inputsPivotRows = (_: State, inputs: VisualizationInputs) =>
    inputs.initialPivotRows;

// A repaired value that equals the stored one keeps the stored identity
const keepIfEqual = <T>(stored: T, repaired: T) =>
    isEqual(stored, repaired) ? stored : repaired;

export const selectTableSelectedItemIds = createSelector(
    [inputsMetricQuery],
    getTableSelectedItemIds,
);

export const selectTableRowFieldIds = createSelector(
    [
        selectTableSelectedItemIds,
        inputsItemsMap,
        inputsPivotDimensions,
        inputsColumnOrder,
        inputsPivotRows,
    ],
    (selectedItemIds, itemsMap, pivotDimensions, columnOrder, pivotRows) =>
        resolvePivotRowFieldIds({
            selectedItemIds,
            itemsMap,
            pivotDimensions,
            columnOrder,
            pivotRows,
        }),
);

const selectTableDimensions = createSelector(
    [inputsColumnOrder, inputsItemsMap],
    getTableDimensions,
);

const selectNumUnpivotedDimensions = createSelector(
    [selectTableDimensions, inputsPivotDimensions],
    getNumUnpivotedDimensions,
);

/** Ignores merges; `useTableCanUseSubtotals` adds the merge check */
export const selectTableCanUseSubtotals = createSelector(
    [selectNumUnpivotedDimensions],
    (numUnpivotedDimensions) =>
        canUseTableSubtotals(numUnpivotedDimensions, false),
);

export const selectTableHasTotalableColumns = createSelector(
    [inputsColumnOrder, inputsItemsMap],
    hasTotalableColumns,
);

export const selectTableIsPivotTableEnabled = createSelector(
    [inputsResults, inputsPivotDimensions],
    isPivotTableEnabled,
);

/** Stored column properties minus the columns the results no longer have */
export const selectTableColumnProperties = createSelector(
    [
        (state: State) => selectTableEditor(state).columnProperties,
        selectTableSelectedItemIds,
    ],
    (columnProperties, selectedItemIds) =>
        selectedItemIds && Object.keys(columnProperties).length > 0
            ? keepIfEqual(
                  columnProperties,
                  pruneTableColumnProperties(columnProperties, selectedItemIds),
              )
            : columnProperties,
);

/** Stored value, or on when the items come from a table and none was saved */
export const selectTableShowTableNames = createSelector(
    [(state: State) => selectTableEditor(state).showTableNames, inputsItemsMap],
    (showTableNames, itemsMap) =>
        showTableNames ??
        (itemsMap !== undefined && shouldDefaultShowTableNames(itemsMap)),
);

/** Off once there are not enough un-pivoted dimensions for subtotals */
export const selectTableShowSubtotals = createSelector(
    [
        (state: State) => selectTableEditor(state).showSubtotals,
        selectTableDimensions,
        selectNumUnpivotedDimensions,
    ],
    (showSubtotals, dimensions, numUnpivotedDimensions) =>
        showSubtotals &&
        !shouldDisableSubtotals(dimensions.length, numUnpivotedDimensions),
);

/** Off once no visible value is left to lay out as rows */
export const selectTableMetricsAsRows = createSelector(
    [
        (state: State) => selectTableEditor(state).metricsAsRows,
        selectTableSelectedItemIds,
        selectTableColumnProperties,
        selectTableRowFieldIds,
        inputsItemsMap,
    ],
    (metricsAsRows, selectedItemIds, columnProperties, rowFieldIds, itemsMap) =>
        metricsAsRows &&
        !shouldDisableMetricsAsRows({
            metricsAsRows,
            selectedItemIds: selectedItemIds?.filter(
                (fieldId) => columnProperties[fieldId]?.visible !== false,
            ),
            rowFieldIds,
            itemsMap,
        }),
);

export const selectTableIsPivotResultStale = createSelector(
    [
        inputsPivotDimensions,
        (_: State, inputs: VisualizationInputs) =>
            inputs.resultsData?.pivotDetails?.groupByColumns,
        selectTableColumnProperties,
    ],
    (pivotDimensions, groupByColumns, columnProperties) =>
        isPivotResultStale(pivotDimensions, groupByColumns, (fieldId) =>
            isTableColumnVisible(columnProperties, fieldId),
        ),
);

export const selectTableValidConfig = createSelector(
    [
        selectTableEditor,
        selectTableShowTableNames,
        selectTableShowSubtotals,
        selectTableColumnProperties,
        selectTableMetricsAsRows,
    ],
    (
        editor,
        showTableNames,
        showSubtotals,
        columnProperties,
        metricsAsRows,
    ): TableChart => ({
        showColumnCalculation: editor.showColumnCalculation,
        showRowCalculation: editor.showRowCalculation,
        showTableNames,
        showResultsTotal: editor.showResultsTotal,
        showSubtotals,
        showSubtotalsExpanded: editor.showSubtotalsExpanded,
        showRowGrouping: editor.showRowGrouping,
        columns: columnProperties,
        hideRowNumbers: editor.hideRowNumbers,
        conditionalFormattings: editor.conditionalFormattings,
        metricsAsRows,
        rowLimit: editor.rowLimit,
    }),
);
