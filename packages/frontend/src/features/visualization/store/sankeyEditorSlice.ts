import { type SankeyChart } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

export type SankeyEditorState = {
    sourceFieldId: string | null;
    targetFieldId: string | null;
    metricFieldId: string | null;
    nodeAlign: NonNullable<SankeyChart['nodeAlign']>;
    orient: NonNullable<SankeyChart['orient']>;
    nodeLayout: NonNullable<SankeyChart['nodeLayout']>;
};

export const buildSankeyEditorState = (
    initialChartConfig: SankeyChart | undefined,
): SankeyEditorState => ({
    sourceFieldId: initialChartConfig?.sourceFieldId ?? null,
    targetFieldId: initialChartConfig?.targetFieldId ?? null,
    metricFieldId: initialChartConfig?.metricFieldId ?? null,
    nodeAlign: initialChartConfig?.nodeAlign ?? 'justify',
    orient: initialChartConfig?.orient ?? 'horizontal',
    nodeLayout: initialChartConfig?.nodeLayout ?? 'multi-step',
});

const sankeyEditorSlice = createSlice({
    name: 'sankeyEditor',
    initialState: null as SankeyEditorState | null,
    reducers: editorCaseReducers<SankeyEditorState>(),
});

export const sankeyEditorActions = sankeyEditorSlice.actions;
export const sankeyEditorReducer = sankeyEditorSlice.reducer;
