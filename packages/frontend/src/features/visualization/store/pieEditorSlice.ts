import {
    PieChartLegendLabelMaxLengthDefault,
    PieChartLegendPositionDefault,
    type PieChart,
    type PieChartLegendPosition,
    type PieChartValueOptions,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import isEmpty from 'lodash/isEmpty';
import mapValues from 'lodash/mapValues';
import omitBy from 'lodash/omitBy';
import { editorCaseReducers } from './editorSlice';

export type PieEditorState = {
    groupFieldIds: string[];
    metricId: string | null;
    isDonut: boolean;
    valueLabel: PieChartValueOptions['valueLabel'];
    showValue: PieChartValueOptions['showValue'];
    showPercentage: PieChartValueOptions['showPercentage'];
    valueLabelColor: PieChartValueOptions['valueLabelColor'];
    groupLabelOverrides: Record<string, string>;
    groupColorOverrides: Record<string, string>;
    groupValueOptionOverrides: Record<string, Partial<PieChartValueOptions>>;
    groupSortOverrides: string[];
    showLegend: boolean;
    legendPosition: PieChartLegendPosition;
    legendMaxItemLength: number | undefined;
};

export const buildPieEditorState = (
    initialChartConfig: PieChart | undefined,
): PieEditorState => ({
    groupFieldIds: initialChartConfig?.groupFieldIds ?? [],
    metricId: initialChartConfig?.metricId ?? null,
    isDonut: initialChartConfig?.isDonut ?? true,
    valueLabel: initialChartConfig?.valueLabel ?? 'hidden',
    showValue: initialChartConfig?.showValue ?? false,
    showPercentage: initialChartConfig?.showPercentage ?? true,
    valueLabelColor: initialChartConfig?.valueLabelColor,
    groupLabelOverrides: initialChartConfig?.groupLabelOverrides ?? {},
    groupColorOverrides: initialChartConfig?.groupColorOverrides ?? {},
    groupValueOptionOverrides:
        initialChartConfig?.groupValueOptionOverrides ?? {},
    groupSortOverrides: initialChartConfig?.groupSortOverrides ?? [],
    showLegend: initialChartConfig?.showLegend ?? true,
    legendPosition:
        initialChartConfig?.legendPosition ?? PieChartLegendPositionDefault,
    legendMaxItemLength:
        initialChartConfig?.legendMaxItemLength ??
        PieChartLegendLabelMaxLengthDefault,
});

const withoutOverride = (
    overrides: Record<string, string>,
    key: string,
    value: string,
) => {
    const { [key]: _, ...rest } = overrides;
    return value === '' ? rest : { ...rest, [key]: value };
};

const pieEditorSlice = createSlice({
    name: 'pieEditor',
    initialState: null as PieEditorState | null,
    reducers: {
        ...editorCaseReducers<PieEditorState>(),
        groupAdd: (
            state,
            action: PayloadAction<{
                dimensionId: string | undefined;
                dimensionIds: string[];
            }>,
        ) => {
            if (!state) return;
            const { dimensionId, dimensionIds } = action.payload;
            const nextId =
                dimensionId ??
                dimensionIds.find((id) => !state.groupFieldIds.includes(id));
            if (!nextId) return;
            state.groupFieldIds = [
                ...new Set([...state.groupFieldIds, nextId]),
            ];
        },
        groupChange: (
            state,
            action: PayloadAction<{
                prevDimensionId: string;
                newDimensionId: string;
            }>,
        ) => {
            if (!state) return;
            const next = new Set(state.groupFieldIds);
            next.delete(action.payload.prevDimensionId);
            next.add(action.payload.newDimensionId);
            state.groupFieldIds = [...next];
        },
        groupRemove: (state, action: PayloadAction<string>) => {
            if (!state) return;
            state.groupFieldIds = state.groupFieldIds.filter(
                (id) => id !== action.payload,
            );
        },
        toggleDonut: (state) => {
            if (!state) return;
            state.isDonut = !state.isDonut;
        },
        // Changing a chart-wide value option drops the per-group overrides of it
        valueLabelChange: (
            state,
            action: PayloadAction<PieChartValueOptions['valueLabel']>,
        ) => {
            if (!state) return;
            state.valueLabel = action.payload;
            state.groupValueOptionOverrides = mapValues(
                state.groupValueOptionOverrides,
                ({ valueLabel: _, ...rest }) => ({ ...rest }),
            );
        },
        toggleShowValue: (state) => {
            if (!state) return;
            state.showValue = !state.showValue;
            state.groupValueOptionOverrides = mapValues(
                state.groupValueOptionOverrides,
                ({ showValue: _, ...rest }) => ({ ...rest }),
            );
        },
        toggleShowPercentage: (state) => {
            if (!state) return;
            state.showPercentage = !state.showPercentage;
            state.groupValueOptionOverrides = mapValues(
                state.groupValueOptionOverrides,
                ({ showPercentage: _, ...rest }) => ({ ...rest }),
            );
        },
        valueLabelColorChange: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            if (!state) return;
            state.valueLabelColor = action.payload;
            state.groupValueOptionOverrides = mapValues(
                state.groupValueOptionOverrides,
                ({ valueLabelColor: _, ...rest }) => ({ ...rest }),
            );
        },
        groupLabelChange: (
            state,
            action: PayloadAction<{ key: string; value: string }>,
        ) => {
            if (!state) return;
            state.groupLabelOverrides = withoutOverride(
                state.groupLabelOverrides,
                action.payload.key,
                action.payload.value,
            );
        },
        groupColorChange: (
            state,
            action: PayloadAction<{ key: string; value: string }>,
        ) => {
            if (!state) return;
            state.groupColorOverrides = withoutOverride(
                state.groupColorOverrides,
                action.payload.key,
                action.payload.value,
            );
        },
        groupValueOptionChange: (
            state,
            action: PayloadAction<{
                label: string;
                value: Partial<PieChartValueOptions>;
            }>,
        ) => {
            if (!state) return;
            const { label, value } = action.payload;
            const nextOptions = omitBy(
                { ...state.groupValueOptionOverrides[label], ...value },
                (option) => option === undefined,
            );
            if (isEmpty(nextOptions)) {
                delete state.groupValueOptionOverrides[label];
                return;
            }
            state.groupValueOptionOverrides[label] = nextOptions;
        },
        groupSortChange: (
            state,
            action: PayloadAction<{
                oldIndex: number;
                newIndex: number;
                groupLabels: string[];
            }>,
        ) => {
            if (!state) return;
            const { oldIndex, newIndex, groupLabels } = action.payload;
            const filteredOverrides = state.groupSortOverrides.filter((label) =>
                groupLabels.includes(label),
            );
            const newSort = [
                ...(filteredOverrides.length > 0
                    ? filteredOverrides
                    : groupLabels),
            ];
            const [removed] = newSort.splice(oldIndex, 1);
            newSort.splice(newIndex, 0, removed);
            state.groupSortOverrides = newSort;
        },
        toggleShowLegend: (state) => {
            if (!state) return;
            state.showLegend = !state.showLegend;
        },
    },
});

export const pieEditorActions = pieEditorSlice.actions;
export const pieEditorReducer = pieEditorSlice.reducer;
