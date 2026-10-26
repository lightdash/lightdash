import { type GaugeChart, type GaugeSection } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
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
    reducers: editorCaseReducers<GaugeEditorState>(),
});

export const gaugeEditorActions = gaugeEditorSlice.actions;
export const gaugeEditorReducer = gaugeEditorSlice.reducer;
