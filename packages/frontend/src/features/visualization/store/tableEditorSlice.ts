import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the table editor hook moves onto the store
export type TableEditorState = Record<string, never>;

export const buildTableEditorState = (): TableEditorState => ({});

const tableEditorSlice = createSlice({
    name: 'tableEditor',
    initialState: null as TableEditorState | null,
    reducers: editorCaseReducers<TableEditorState>(),
});

export const tableEditorActions = tableEditorSlice.actions;
export const tableEditorReducer = tableEditorSlice.reducer;
