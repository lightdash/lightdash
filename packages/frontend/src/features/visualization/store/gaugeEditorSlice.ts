import { type GaugeChart, type GaugeSection } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

export type GaugeEditorState = {
    selectedField: string | undefined;
    min: number;
    max: number;
    maxFieldId: string | undefined;
    showAxisLabels: boolean;
    sections: GaugeSection[];
    customLabel: string | undefined;
    showPercentage: boolean;
    customPercentageLabel: string | undefined;
};

export const buildGaugeEditorState = (
    initialChartConfig: GaugeChart | undefined,
): GaugeEditorState => ({
    selectedField: initialChartConfig?.selectedField,
    min: initialChartConfig?.min ?? 0,
    max: initialChartConfig?.max ?? 100,
    maxFieldId: initialChartConfig?.maxFieldId,
    showAxisLabels: initialChartConfig?.showAxisLabels ?? false,
    sections: initialChartConfig?.sections ?? [],
    customLabel: initialChartConfig?.customLabel,
    showPercentage: initialChartConfig?.showPercentage ?? false,
    customPercentageLabel: initialChartConfig?.customPercentageLabel,
});

const gaugeEditorSlice = createSlice({
    name: 'gaugeEditor',
    initialState: buildGaugeEditorState(undefined),
    reducers: {
        ...editorCaseReducers<GaugeEditorState>(),
        // A new section spans the current scale
        addSection: (state) => {
            state.sections.push({
                min: state.min,
                max: state.max,
                color: '#5470c6',
            });
        },
        removeSection: (state, action: PayloadAction<number>) => {
            state.sections.splice(action.payload, 1);
        },
        // Ignores an index that no longer exists
        updateSection: (
            state,
            action: PayloadAction<{
                index: number;
                changes: Partial<GaugeSection>;
            }>,
        ) => {
            const section = state.sections[action.payload.index];
            if (section) Object.assign(section, action.payload.changes);
        },
    },
});

export const gaugeEditorActions = gaugeEditorSlice.actions;
export const gaugeEditorReducer = gaugeEditorSlice.reducer;
