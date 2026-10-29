import {
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type RowLimit,
    type TableChart,
} from '@lightdash/common';
import { shouldDefaultShowTableNames } from '@lightdash/visualization/editor';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { editorCaseReducers, type EditorSeedContext } from './editorSlice';

export type TableEditorState = {
    showColumnCalculation: boolean;
    showRowCalculation: boolean;
    conditionalFormattings: ConditionalFormattingConfig[];
    // Undefined until set; a derivation defaults it from the items' tables
    showTableNames: boolean | undefined;
    showResultsTotal: boolean;
    showSubtotals: boolean;
    showSubtotalsExpanded: boolean;
    showRowGrouping: boolean;
    hideRowNumbers: boolean;
    metricsAsRows: boolean;
    rowLimit: RowLimit | undefined;
    columnProperties: Record<string, ColumnProperties>;
};

// Unsaved: the items' default when loaded, off for an owner, else derived once they load
const seedShowTableNames = (
    saved: boolean | null | undefined,
    seed: EditorSeedContext,
): boolean | undefined => {
    // A YAML or JSON null reads as off
    if (saved === null) return false;
    if (saved !== undefined) return saved;
    if (seed.itemsMap !== undefined)
        return shouldDefaultShowTableNames(seed.itemsMap);
    return seed.hasConfigOwner ? false : undefined;
};

export const buildTableEditorState = (
    initialChartConfig: TableChart | undefined,
    seed: EditorSeedContext = { itemsMap: undefined, hasConfigOwner: false },
): TableEditorState => ({
    showColumnCalculation: !!initialChartConfig?.showColumnCalculation,
    showRowCalculation: !!initialChartConfig?.showRowCalculation,
    conditionalFormattings: initialChartConfig?.conditionalFormattings ?? [],
    showTableNames: seedShowTableNames(
        initialChartConfig?.showTableNames,
        seed,
    ),
    showResultsTotal: initialChartConfig?.showResultsTotal ?? false,
    showSubtotals: initialChartConfig?.showSubtotals ?? false,
    showSubtotalsExpanded: initialChartConfig?.showSubtotalsExpanded ?? false,
    showRowGrouping: initialChartConfig?.showRowGrouping ?? false,
    hideRowNumbers: initialChartConfig?.hideRowNumbers ?? false,
    metricsAsRows: initialChartConfig?.metricsAsRows || false,
    rowLimit: initialChartConfig?.rowLimit,
    columnProperties: initialChartConfig?.columns ?? {},
});

export type TableToggleKey =
    | 'showColumnCalculation'
    | 'showRowCalculation'
    | 'showResultsTotal'
    | 'showSubtotals'
    | 'showSubtotalsExpanded'
    | 'showRowGrouping'
    | 'hideRowNumbers';

const tableEditorSlice = createSlice({
    name: 'tableEditor',
    initialState: buildTableEditorState(undefined),
    reducers: {
        ...editorCaseReducers<TableEditorState>(),
        toggle: (state, action: PayloadAction<TableToggleKey>) => {
            state[action.payload] = !state[action.payload];
        },
        updateColumnProperty: (
            state,
            action: PayloadAction<{
                field: string;
                properties: Partial<ColumnProperties>;
            }>,
        ) => {
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
