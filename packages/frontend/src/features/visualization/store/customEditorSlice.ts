import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the custom editor hook moves onto the store
export type CustomEditorState = Record<string, never>;

export const buildCustomEditorState = (): CustomEditorState => ({});

const customEditorSlice = createSlice({
    name: 'customEditor',
    initialState: null as CustomEditorState | null,
    reducers: editorCaseReducers<CustomEditorState>(),
});

export const customEditorActions = customEditorSlice.actions;
export const customEditorReducer = customEditorSlice.reducer;
