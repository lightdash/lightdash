import {
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type RowLimit,
    type TableChart,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

export type TableEditorState = {
    showColumnCalculation: boolean;
    showRowCalculation: boolean;
    conditionalFormattings: ConditionalFormattingConfig[];
    showTableNames: boolean;
    showResultsTotal: boolean;
    showSubtotals: boolean;
    showSubtotalsExpanded: boolean;
    showRowGrouping: boolean;
    hideRowNumbers: boolean;
    metricsAsRows: boolean;
    rowLimit: RowLimit | undefined;
    columnProperties: Record<string, ColumnProperties>;
};

export const buildTableEditorState = (
    initialChartConfig: TableChart | undefined,
): TableEditorState => ({
    showColumnCalculation: !!initialChartConfig?.showColumnCalculation,
    showRowCalculation: !!initialChartConfig?.showRowCalculation,
    conditionalFormattings: initialChartConfig?.conditionalFormattings ?? [],
    showTableNames: initialChartConfig?.showTableNames ?? false,
    showResultsTotal: initialChartConfig?.showResultsTotal ?? false,
    showSubtotals: initialChartConfig?.showSubtotals ?? false,
    showSubtotalsExpanded: initialChartConfig?.showSubtotalsExpanded ?? false,
    showRowGrouping: initialChartConfig?.showRowGrouping ?? false,
    hideRowNumbers: initialChartConfig?.hideRowNumbers ?? false,
    metricsAsRows: initialChartConfig?.metricsAsRows || false,
    rowLimit: initialChartConfig?.rowLimit,
    columnProperties: initialChartConfig?.columns ?? {},
});

const tableEditorSlice = createSlice({
    name: 'tableEditor',
    initialState: null as TableEditorState | null,
    reducers: {
        ...editorCaseReducers<TableEditorState>(),
        updateColumnProperty: (
            state,
            action: PayloadAction<{
                field: string;
                properties: Partial<ColumnProperties>;
            }>,
        ) => {
            if (!state) return;
            const { field, properties } = action.payload;
            state.columnProperties[field] = {
                ...state.columnProperties[field],
                ...properties,
            };
        },
    },
});

export const tableEditorActions = tableEditorSlice.actions;
export const tableEditorReducer = tableEditorSlice.reducer;
