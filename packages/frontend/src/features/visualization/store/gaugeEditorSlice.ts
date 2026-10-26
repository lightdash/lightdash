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
    initialState: null as GaugeEditorState | null,
    reducers: {
        ...editorCaseReducers<GaugeEditorState>(),
        // A new section spans the current scale
        addSection: (state) => {
            if (!state) return;
            state.sections.push({
                min: state.min,
                max: state.max,
                color: '#5470c6',
            });
        },
        removeSection: (state, action: PayloadAction<number>) => {
            if (!state) return;
            state.sections.splice(action.payload, 1);
        },
        updateSection: (
            state,
            action: PayloadAction<{
                index: number;
                section: Partial<GaugeSection>;
            }>,
        ) => {
            if (!state) return;
            const { index, section } = action.payload;
            state.sections[index] = { ...state.sections[index], ...section };
        },
    },
});

export const gaugeEditorActions = gaugeEditorSlice.actions;
export const gaugeEditorReducer = gaugeEditorSlice.reducer;
