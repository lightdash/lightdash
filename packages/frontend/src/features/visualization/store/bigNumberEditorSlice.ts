import {
    ComparisonFormatTypes,
    type BigNumber,
    type CompactOrAlias,
    type ConditionalFormattingConfig,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
    editorCaseReducers,
    renamedFieldId,
    tableCalculationsRenamed,
} from './editorSlice';

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
    selectedField: initialChartConfig?.selectedField,
    showTableNamesInLabel: initialChartConfig?.showTableNamesInLabel ?? true,
    bigNumberLabel: initialChartConfig?.label,
    showBigNumberLabel: initialChartConfig?.showBigNumberLabel ?? true,
    bigNumberStyle: initialChartConfig?.style,
    bigNumberComparisonStyle: initialChartConfig?.style,
    showComparison: initialChartConfig?.showComparison ?? false,
    comparisonFormat:
        initialChartConfig?.comparisonFormat ?? ComparisonFormatTypes.RAW,
    flipColors: initialChartConfig?.flipColors ?? false,
    comparisonLabel: initialChartConfig?.comparisonLabel,
    comparisonField: initialChartConfig?.comparisonField,
    conditionalFormattings: initialChartConfig?.conditionalFormattings ?? [],
});

const bigNumberEditorSlice = createSlice({
    name: 'bigNumberEditor',
    initialState: null as BigNumberEditorState | null,
    reducers: {
        ...editorCaseReducers<BigNumberEditorState>(),
        // The value's style also resets the comparison's
        styleChange: (
            state,
            action: PayloadAction<CompactOrAlias | undefined>,
        ) => {
            if (!state) return;
            state.bigNumberStyle = action.payload;
            state.bigNumberComparisonStyle = action.payload;
        },
        toggleShowBigNumberLabel: (state) => {
            if (!state) return;
            state.showBigNumberLabel = !state.showBigNumberLabel;
        },
        toggleShowTableNamesInLabel: (state) => {
            if (!state) return;
            state.showTableNamesInLabel = !state.showTableNamesInLabel;
        },
        toggleShowComparison: (state) => {
            if (!state) return;
            state.showComparison = !state.showComparison;
        },
        toggleFlipColors: (state) => {
            if (!state) return;
            state.flipColors = !state.flipColors;
        },
        conditionalFormattingAdd: (
            state,
            action: PayloadAction<ConditionalFormattingConfig>,
        ) => {
            if (!state) return;
            state.conditionalFormattings.push(action.payload);
        },
        conditionalFormattingRemove: (state, action: PayloadAction<number>) => {
            if (!state) return;
            state.conditionalFormattings.splice(action.payload, 1);
        },
        conditionalFormattingChange: (
            state,
            action: PayloadAction<{
                index: number;
                config: ConditionalFormattingConfig;
            }>,
        ) => {
            if (!state) return;
            state.conditionalFormattings[action.payload.index] =
                action.payload.config;
        },
    },
    extraReducers: (builder) =>
        builder.addCase(tableCalculationsRenamed, (state, { payload }) => {
            if (!state?.selectedField) return;
            state.selectedField = renamedFieldId(state.selectedField, payload);
        }),
});

export const bigNumberEditorActions = bigNumberEditorSlice.actions;
export const bigNumberEditorReducer = bigNumberEditorSlice.reducer;
