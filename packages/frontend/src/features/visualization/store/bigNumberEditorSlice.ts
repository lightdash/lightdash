import {
    ComparisonFormatTypes,
    type BigNumber,
    type ConditionalFormattingConfig,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

export type BigNumberEditorState = {
    selectedField: string | undefined;
    showTableNamesInLabel: BigNumber['showTableNamesInLabel'];
    bigNumberLabel: BigNumber['label'];
    showBigNumberLabel: BigNumber['showBigNumberLabel'];
    bigNumberStyle: BigNumber['style'];
    bigNumberComparisonStyle: BigNumber['style'];
    showComparison: BigNumber['showComparison'];
    comparisonFormat: BigNumber['comparisonFormat'];
    flipColors: BigNumber['flipColors'];
    comparisonLabel: BigNumber['comparisonLabel'];
    comparisonField: BigNumber['comparisonField'];
    conditionalFormattings: ConditionalFormattingConfig[];
};

export const buildBigNumberEditorState = (
    initialChartConfig: BigNumber | undefined,
): BigNumberEditorState => ({
    selectedField: undefined,
    showTableNamesInLabel: initialChartConfig?.showTableNamesInLabel,
    bigNumberLabel: initialChartConfig?.label,
    showBigNumberLabel: initialChartConfig?.showBigNumberLabel,
    bigNumberStyle: initialChartConfig?.style,
    bigNumberComparisonStyle: initialChartConfig?.style,
    showComparison: initialChartConfig?.showComparison,
    comparisonFormat: initialChartConfig?.comparisonFormat,
    flipColors: initialChartConfig?.flipColors,
    comparisonLabel: initialChartConfig?.comparisonLabel,
    comparisonField: initialChartConfig?.comparisonField,
    conditionalFormattings: initialChartConfig?.conditionalFormattings ?? [],
});

const bigNumberEditorSlice = createSlice({
    name: 'bigNumberEditor',
    initialState: null as BigNumberEditorState | null,
    reducers: {
        ...editorCaseReducers<BigNumberEditorState>(),
        // Re-seeds every field from a changed saved config, with defaults applied
        syncFromConfig: (
            state,
            action: PayloadAction<BigNumber | undefined>,
        ) => {
            if (!state) return;
            const config = action.payload;
            if (config?.selectedField !== undefined)
                state.selectedField = config.selectedField;
            state.bigNumberLabel = config?.label;
            state.showBigNumberLabel = config?.showBigNumberLabel ?? true;
            state.showTableNamesInLabel = config?.showTableNamesInLabel ?? true;
            state.bigNumberStyle = config?.style;
            state.bigNumberComparisonStyle = config?.style;
            state.showComparison = config?.showComparison ?? false;
            state.comparisonFormat =
                config?.comparisonFormat ?? ComparisonFormatTypes.RAW;
            state.flipColors = config?.flipColors ?? false;
            state.comparisonLabel = config?.comparisonLabel;
            state.conditionalFormattings = config?.conditionalFormattings ?? [];
            state.comparisonField = config?.comparisonField;
        },
    },
});

export const bigNumberEditorActions = bigNumberEditorSlice.actions;
export const bigNumberEditorReducer = bigNumberEditorSlice.reducer;
