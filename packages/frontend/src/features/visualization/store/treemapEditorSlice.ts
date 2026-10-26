import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the treemap editor hook moves onto the store
export type TreemapEditorState = Record<string, never>;

export const buildTreemapEditorState = (): TreemapEditorState => ({});

const treemapEditorSlice = createSlice({
    name: 'treemapEditor',
    initialState: null as TreemapEditorState | null,
    reducers: editorCaseReducers<TreemapEditorState>(),
});

export const treemapEditorActions = treemapEditorSlice.actions;
export const treemapEditorReducer = treemapEditorSlice.reducer;
