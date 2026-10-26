import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the bigNumber editor hook moves onto the store
export type BigNumberEditorState = Record<string, never>;

export const buildBigNumberEditorState = (): BigNumberEditorState => ({});

const bigNumberEditorSlice = createSlice({
    name: 'bigNumberEditor',
    initialState: null as BigNumberEditorState | null,
    reducers: editorCaseReducers<BigNumberEditorState>(),
});

export const bigNumberEditorActions = bigNumberEditorSlice.actions;
export const bigNumberEditorReducer = bigNumberEditorSlice.reducer;
