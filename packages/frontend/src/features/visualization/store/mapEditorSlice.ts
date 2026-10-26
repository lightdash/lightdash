import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// ponytail: placeholder until the map editor hook moves onto the store
export type MapEditorState = Record<string, never>;

export const buildMapEditorState = (): MapEditorState => ({});

const mapEditorSlice = createSlice({
    name: 'mapEditor',
    initialState: null as MapEditorState | null,
    reducers: editorCaseReducers<MapEditorState>(),
});

export const mapEditorActions = mapEditorSlice.actions;
export const mapEditorReducer = mapEditorSlice.reducer;
