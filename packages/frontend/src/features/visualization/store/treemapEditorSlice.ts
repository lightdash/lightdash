import { type TreemapChart } from '@lightdash/common';
import {
    reorderTreemapGroupFieldIds,
    TREEMAP_DEFAULT_END_COLOR,
    TREEMAP_DEFAULT_LEAF_DEPTH,
    TREEMAP_DEFAULT_START_COLOR,
    TREEMAP_DEFAULT_VISIBLE_MIN,
} from '@lightdash/visualization/editor';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
    editorCaseReducers,
    renamedFieldId,
    tableCalculationsRenamed,
} from './editorSlice';

export type TreemapEditorState = {
    visibleMin: number;
    leafDepth: number;
    groupFieldIds: string[];
    sizeMetricId: string | null;
    colorMetricId: string | null;
    startColor: string;
    endColor: string;
    useDynamicColors: boolean;
    startColorThreshold: number | undefined;
    endColorThreshold: number | undefined;
};

export const buildTreemapEditorState = (
    initialChartConfig: TreemapChart | undefined,
): TreemapEditorState => ({
    visibleMin: initialChartConfig?.visibleMin ?? TREEMAP_DEFAULT_VISIBLE_MIN,
    leafDepth: initialChartConfig?.leafDepth ?? TREEMAP_DEFAULT_LEAF_DEPTH,
    // Validity against the loaded dimensions is derived by the selector
    groupFieldIds: initialChartConfig?.groupFieldIds ?? [],
    sizeMetricId: initialChartConfig?.sizeMetricId ?? null,
    colorMetricId: initialChartConfig?.colorMetricId ?? null,
    startColor: initialChartConfig?.startColor ?? TREEMAP_DEFAULT_START_COLOR,
    endColor: initialChartConfig?.endColor ?? TREEMAP_DEFAULT_END_COLOR,
    useDynamicColors: initialChartConfig?.useDynamicColors ?? false,
    startColorThreshold: initialChartConfig?.startColorThreshold ?? undefined,
    endColorThreshold: initialChartConfig?.endColorThreshold ?? undefined,
});

const treemapEditorSlice = createSlice({
    name: 'treemapEditor',
    initialState: buildTreemapEditorState(undefined),
    reducers: {
        ...editorCaseReducers<TreemapEditorState>(),
        // Turning dynamic colors off drops the color metric
        toggleDynamicColors: (state) => {
            if (state.useDynamicColors) state.colorMetricId = null;
            state.useDynamicColors = !state.useDynamicColors;
        },
        // Reorders the displayed (derived) list, which may differ from the stored one
        groupReorder: (
            state,
            action: PayloadAction<{
                from: number;
                to: number;
                groupFieldIds: string[];
            }>,
        ) => {
            const { groupFieldIds, ...move } = action.payload;
            state.groupFieldIds = reorderTreemapGroupFieldIds(
                groupFieldIds,
                move,
            );
        },
    },
    extraReducers: (builder) =>
        builder.addCase(tableCalculationsRenamed, (state, { payload }) => {
            const rename = (id: string | null) =>
                id === null ? null : renamedFieldId(id, payload);
            state.sizeMetricId = rename(state.sizeMetricId);
            state.colorMetricId = rename(state.colorMetricId);
        }),
});

export const treemapEditorActions = treemapEditorSlice.actions;
export const treemapEditorReducer = treemapEditorSlice.reducer;
