import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the sankey editor hook moves onto the store
export type SankeyEditorState = Record<string, never>;

export const buildSankeyEditorState = (): SankeyEditorState => ({});

const sankeyEditorSlice = createSlice({
    name: 'sankeyEditor',
    initialState: null as SankeyEditorState | null,
    reducers: editorCaseReducers<SankeyEditorState>(),
});

export const sankeyEditorActions = sankeyEditorSlice.actions;
export const sankeyEditorReducer = sankeyEditorSlice.reducer;
