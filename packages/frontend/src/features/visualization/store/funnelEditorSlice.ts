import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the funnel editor hook moves onto the store
export type FunnelEditorState = Record<string, never>;

export const buildFunnelEditorState = (): FunnelEditorState => ({});

const funnelEditorSlice = createSlice({
    name: 'funnelEditor',
    initialState: null as FunnelEditorState | null,
    reducers: editorCaseReducers<FunnelEditorState>(),
});

export const funnelEditorActions = funnelEditorSlice.actions;
export const funnelEditorReducer = funnelEditorSlice.reducer;
