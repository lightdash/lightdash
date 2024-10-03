import {
    ChartKind,
    isVizPieChartConfig,
    VIZ_DEFAULT_AGGREGATION,
    type DimensionType,
    type VizAggregationOptions,
    type VizConfigErrors,
    type VizIndexType,
    type VizPieChartConfig,
    type VizPieChartOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import {
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
} from './actions/commonChartActions';

export type PieChartState = {
    metadata: {
        version: number;
    };
    fieldConfig: VizPieChartConfig['fieldConfig'] | undefined;
    display: VizPieChartConfig['display'];
    options: VizPieChartOptions;
    errors: VizConfigErrors | undefined;
};

const initialState: PieChartState = {
    metadata: {
        version: 1,
    },
    fieldConfig: undefined,
    display: {
        isDonut: false,
    },
    options: {
        groupFieldOptions: [],
        metricFieldOptions: [],
        customMetricFieldOptions: [],
    },
    errors: undefined,
};

export const pieChartConfigSlice = createSlice({
    name: 'pieChartConfig',
    initialState,
    reducers: {
        setGroupFieldIds: (
            { fieldConfig },
            action: PayloadAction<{
                reference: string;
                axisType: VizIndexType;
                dimensionType: DimensionType;
            }>,
        ) => {
            if (fieldConfig?.x) {
                fieldConfig.x = {
                    reference: action.payload.reference,
                    axisType: action.payload.axisType,
                    dimensionType: action.payload.dimensionType,
                };
            }
        },
        setYAxisReference: (
            state,
            action: PayloadAction<{
                reference: string;
                index: number;
            }>,
        ) => {
            if (state.fieldConfig?.y) {
                const yAxis = state.fieldConfig.y[action.payload.index];
                if (yAxis) {
                    yAxis.reference = action.payload.reference;
                    yAxis.aggregation =
                        state.options.metricFieldOptions.find(
                            (option) =>
                                option.reference === action.payload.reference,
                        )?.aggregationOptions?.[0] ?? VIZ_DEFAULT_AGGREGATION;
                }
            }
        },
        setYAxisAggregation: (
            { fieldConfig },
            action: PayloadAction<{
                index: number;
                aggregation: VizAggregationOptions;
            }>,
        ) => {
            if (!fieldConfig?.y) return;

            const yAxis = fieldConfig.y[action.payload.index];
            if (yAxis) {
                yAxis.aggregation = action.payload.aggregation;
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setChartOptionsAndConfig, (state, action) => {
            if (action.payload.type !== ChartKind.PIE) {
                return;
            }

            state.options = action.payload.options;

            // Only set the initial config if it's not already set and the fieldConfig is present
            if (!state.fieldConfig && action.payload.config.fieldConfig) {
                state.fieldConfig = action.payload.config.fieldConfig;
            }
            if (!state.display && action.payload.config.display) {
                state.display = action.payload.config.display;
            }

            state.errors = action.payload.errors;
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizPieChartConfig(action.payload)) {
                state.fieldConfig = action.payload.fieldConfig;
                state.display = action.payload.display;
            }
        });
        builder.addCase(resetChartState, () => initialState);
    },
});
export const { setGroupFieldIds, setYAxisReference, setYAxisAggregation } =
    pieChartConfigSlice.actions;
