import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the dataAppViz editor hook moves onto the store
export type DataAppVizEditorState = Record<string, never>;

export const buildDataAppVizEditorState = (): DataAppVizEditorState => ({});

const dataAppVizEditorSlice = createSlice({
    name: 'dataAppVizEditor',
    initialState: null as DataAppVizEditorState | null,
    reducers: editorCaseReducers<DataAppVizEditorState>(),
});

export const dataAppVizEditorActions = dataAppVizEditorSlice.actions;
export const dataAppVizEditorReducer = dataAppVizEditorSlice.reducer;
