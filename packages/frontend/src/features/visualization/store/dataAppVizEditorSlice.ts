import {
    type DataAppVizChart,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * The chart's binding to a picked viz; null while it points at none.
 * Deliberately not Required<DataAppVizChart>: the as-code-only
 * dataAppVizSlug never participates in runtime state.
 */
export type SelectedDataAppViz = Pick<
    DataAppVizChart,
    'dataAppVizUuid' | 'dataAppVizVersion' | 'fieldMapping'
> &
    Required<Pick<DataAppVizChart, 'optionValues'>>;

export type DataAppVizEditorState = {
    config: SelectedDataAppViz | null;
};

// Charts saved while '' stood in for "no viz yet" still carry that value,
// and a config from a URL may carry no uuid at all.
export const readDataAppVizUuid = (
    chartConfig: DataAppVizChart | undefined,
): string | null => {
    const uuid = chartConfig?.dataAppVizUuid;
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
};

const toSelectedDataAppViz = (
    chartConfig: DataAppVizChart | undefined,
): SelectedDataAppViz | null => {
    const dataAppVizUuid = readDataAppVizUuid(chartConfig);
    return chartConfig !== undefined && dataAppVizUuid !== null
        ? {
              dataAppVizUuid,
              dataAppVizVersion: chartConfig.dataAppVizVersion,
              fieldMapping: chartConfig.fieldMapping,
              optionValues: chartConfig.optionValues ?? {},
          }
        : null;
};

export const buildDataAppVizEditorState = (
    initialChartConfig: DataAppVizChart | undefined,
): DataAppVizEditorState => ({
    config: toSelectedDataAppViz(initialChartConfig),
});

// Each edit assigns a fresh config so the hook can tell an applied edit from an ignored one by reference.
const dataAppVizEditorSlice = createSlice({
    name: 'dataAppVizEditor',
    initialState: null as DataAppVizEditorState | null,
    reducers: {
        // The owner switched the viz from outside the editor (the chart gallery)
        externalConfigReceived: (
            state,
            action: PayloadAction<DataAppVizChart | undefined>,
        ) => {
            if (!state) return;
            state.config = toSelectedDataAppViz(action.payload);
        },
        vizCleared: (state) => {
            if (!state) return;
            state.config = null;
        },
        vizSelected: (
            state,
            action: PayloadAction<{
                dataAppVizUuid: string;
                fieldMapping: DataAppVizFieldMapping;
            }>,
        ) => {
            if (!state) return;
            // Options are viz-specific, so switching viz drops them rather
            // than carrying over now-meaningless names. The mapping is
            // replaced wholesale by the caller's auto-binding.
            state.config = { ...action.payload, optionValues: {} };
        },
        versionSet: (state, action: PayloadAction<number>) => {
            const selected = state?.config;
            if (!state || !selected) return;
            if (selected.dataAppVizVersion === action.payload) return;
            state.config = { ...selected, dataAppVizVersion: action.payload };
        },
        versionUpgraded: (
            state,
            action: PayloadAction<{
                dataAppVizVersion: number;
                fieldMapping: DataAppVizFieldMapping;
                optionValues: DataAppVizOptionValues;
            }>,
        ) => {
            const selected = state?.config;
            if (!state || !selected) return;
            state.config = { ...selected, ...action.payload };
        },
        fieldSet: (
            state,
            action: PayloadAction<{
                fieldName: string;
                fieldId: string | string[] | null;
            }>,
        ) => {
            const selected = state?.config;
            if (!state || !selected) return;
            const { fieldName, fieldId } = action.payload;
            const fieldMapping = { ...selected.fieldMapping };
            if (fieldId === null) {
                delete fieldMapping[fieldName];
            } else {
                fieldMapping[fieldName] = fieldId;
            }
            state.config = { ...selected, fieldMapping };
        },
        optionSet: (
            state,
            action: PayloadAction<{
                dataAppVizUuid: string;
                optionName: string;
                value: DataAppVizOptionValue;
            }>,
        ) => {
            const selected = state?.config;
            if (!state || !selected) return;
            const { dataAppVizUuid, optionName, value } = action.payload;
            if (dataAppVizUuid !== selected.dataAppVizUuid) return;
            state.config = {
                ...selected,
                optionValues: { ...selected.optionValues, [optionName]: value },
            };
        },
    },
});

export const dataAppVizEditorActions = dataAppVizEditorSlice.actions;
export const dataAppVizEditorReducer = dataAppVizEditorSlice.reducer;
