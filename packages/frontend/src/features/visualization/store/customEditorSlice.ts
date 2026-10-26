import { type CustomVis } from '@lightdash/common';
import { createSlice } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

export type CustomEditorState = {
    visSpec: string | undefined;
    visSpecObject: CustomVis['spec'];
};

// The hook's effects fill both from the chart config once mounted
export const buildCustomEditorState = (): CustomEditorState => ({
    visSpec: undefined,
    visSpecObject: undefined,
});

const customEditorSlice = createSlice({
    name: 'customEditor',
    initialState: null as CustomEditorState | null,
    reducers: editorCaseReducers<CustomEditorState>(),
});

export const customEditorActions = customEditorSlice.actions;
export const customEditorReducer = customEditorSlice.reducer;
