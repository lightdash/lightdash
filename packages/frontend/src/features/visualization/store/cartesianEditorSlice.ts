import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the cartesian editor hook moves onto the store
export type CartesianEditorState = Record<string, never>;

export const buildCartesianEditorState = (): CartesianEditorState => ({});

const cartesianEditorSlice = createSlice({
    name: 'cartesianEditor',
    initialState: null as CartesianEditorState | null,
    reducers: editorCaseReducers<CartesianEditorState>(),
});

export const cartesianEditorActions = cartesianEditorSlice.actions;
export const cartesianEditorReducer = cartesianEditorSlice.reducer;
