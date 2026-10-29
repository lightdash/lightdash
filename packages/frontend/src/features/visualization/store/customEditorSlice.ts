import { type CustomVis } from '@lightdash/common';
import {
    parseCustomVisualizationSpec,
    serializeCustomVisualizationSpec,
} from '@lightdash/visualization/editor';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type CustomEditorState = {
    visSpec: string | undefined;
    // The last spec text that parsed, so invalid JSON keeps the chart drawn
    visSpecObject: CustomVis['spec'];
};

export const buildCustomEditorState = (
    initialChartConfig?: CustomVis,
): CustomEditorState => {
    const visSpec = initialChartConfig?.spec
        ? serializeCustomVisualizationSpec(initialChartConfig.spec)
        : undefined;
    return {
        visSpec,
        visSpecObject: visSpec
            ? parseCustomVisualizationSpec(visSpec)
            : undefined,
    };
};

const customEditorSlice = createSlice({
    name: 'customEditor',
    initialState: buildCustomEditorState(),
    reducers: {
        // Empty text is never saved, so clearing the editor keeps the last spec
        specChanged: (state, action: PayloadAction<string>) => {
            if (!action.payload) return;
            state.visSpec = action.payload;
            const parsed = parseCustomVisualizationSpec(action.payload);
            if (parsed !== undefined) state.visSpecObject = parsed;
        },
    },
});

export const customEditorActions = customEditorSlice.actions;
export const customEditorReducer = customEditorSlice.reducer;
