import { type SankeyChart } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import {
    editorCaseReducers,
    renamedFieldId,
    tableCalculationsRenamed,
} from './editorSlice';

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
    initialState: buildSankeyEditorState(undefined),
    reducers: editorCaseReducers<SankeyEditorState>(),
    extraReducers: (builder) =>
        builder.addCase(tableCalculationsRenamed, (state, { payload }) => {
            const rename = (id: string | null) =>
                id === null ? null : renamedFieldId(id, payload);
            state.sourceFieldId = rename(state.sourceFieldId);
            state.targetFieldId = rename(state.targetFieldId);
            state.metricFieldId = rename(state.metricFieldId);
        }),
});

export const sankeyEditorActions = sankeyEditorSlice.actions;
export const sankeyEditorReducer = sankeyEditorSlice.reducer;
