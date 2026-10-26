import {
    type FunnelChart,
    type FunnelChartDataInput,
    type FunnelChartLegendPosition,
} from '@lightdash/common';
import {
    DEFAULT_FUNNEL_DATA_INPUT,
    DEFAULT_FUNNEL_LABELS,
    DEFAULT_FUNNEL_LEGEND_POSITION,
    DEFAULT_FUNNEL_SHOW_LEGEND,
} from '@lightdash/visualization/editor';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

export type FunnelEditorState = {
    fieldId: string | null;
    dataInput: FunnelChartDataInput;
    labels: FunnelChart['labels'];
    labelOverrides: Record<string, string>;
    colorOverrides: Record<string, string>;
    showLegend: boolean;
    legendPosition: FunnelChartLegendPosition;
};

export const buildFunnelEditorState = (
    initialChartConfig: FunnelChart | undefined,
): FunnelEditorState => ({
    fieldId: initialChartConfig?.fieldId ?? null,
    dataInput: initialChartConfig?.dataInput ?? DEFAULT_FUNNEL_DATA_INPUT,
    labels: initialChartConfig?.labels ?? DEFAULT_FUNNEL_LABELS,
    labelOverrides: initialChartConfig?.labelOverrides ?? {},
    colorOverrides: initialChartConfig?.colorOverrides ?? {},
    showLegend: initialChartConfig?.showLegend ?? DEFAULT_FUNNEL_SHOW_LEGEND,
    legendPosition:
        initialChartConfig?.legendPosition ?? DEFAULT_FUNNEL_LEGEND_POSITION,
});

const withoutBlankOverride = (
    overrides: Record<string, string>,
    key: string,
    value: string,
) => {
    const { [key]: _, ...rest } = overrides;
    return value.trim() === '' ? rest : { ...rest, [key]: value };
};

const funnelEditorSlice = createSlice({
    name: 'funnelEditor',
    initialState: null as FunnelEditorState | null,
    reducers: {
        ...editorCaseReducers<FunnelEditorState>(),
        labelsMerge: (state, action: PayloadAction<FunnelChart['labels']>) => {
            if (!state) return;
            state.labels = { ...state.labels, ...action.payload };
        },
        labelOverrideChange: (
            state,
            action: PayloadAction<{ key: string; value: string }>,
        ) => {
            if (!state) return;
            state.labelOverrides = withoutBlankOverride(
                state.labelOverrides,
                action.payload.key,
                action.payload.value,
            );
        },
        colorOverrideChange: (
            state,
            action: PayloadAction<{ key: string; value: string }>,
        ) => {
            if (!state) return;
            state.colorOverrides = withoutBlankOverride(
                state.colorOverrides,
                action.payload.key,
                action.payload.value,
            );
        },
        toggleShowLegend: (state) => {
            if (!state) return;
            state.showLegend = !state.showLegend;
        },
    },
});

export const funnelEditorActions = funnelEditorSlice.actions;
export const funnelEditorReducer = funnelEditorSlice.reducer;
