import {
    ChartKind,
    isVizPieChartConfig,
    VIZ_DEFAULT_AGGREGATION,
    type VizAggregationOptions,
    type VizConfigErrors,
    type VizIndexType,
    type VizPieChartConfig,
    type VizPieChartOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { prepareAndFetchChartData } from '../../../features/sqlRunner/store/thunks';
import {
    getNewSortBy,
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
    updateChartSortBy,
} from './actions/commonChartActions';

export type PieChartState = {
    metadata: {
        version: number;
    };
    fieldConfig: VizPieChartConfig['fieldConfig'] | undefined;
    display: VizPieChartConfig['display'];
    options: VizPieChartOptions;
    errors: VizConfigErrors | undefined;
    chartDataLoading: boolean;
    chartDataError: Error | undefined;
    chartData:
        | Awaited<
              ReturnType<
                  typeof prepareAndFetchChartData['fulfilled']
              >['payload']
          >
        | undefined;
    series: string[] | undefined;
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
    chartDataLoading: false,
    chartDataError: undefined,
    chartData: undefined,
    series: undefined,
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
            }>,
        ) => {
            if (fieldConfig?.x) {
                fieldConfig.x = {
                    reference: action.payload.reference,
                    type: action.payload.axisType,
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
        // Include the extraReducers from cartesianChartConfigSlice
        builder.addCase(prepareAndFetchChartData.pending, (state) => {
            state.chartDataLoading = true;
            state.chartDataError = undefined;
        });
        builder.addCase(prepareAndFetchChartData.fulfilled, (state, action) => {
            state.chartDataLoading = false;
            state.series = action.payload?.valuesColumns;
            state.chartData = action.payload;
        });
        builder.addCase(prepareAndFetchChartData.rejected, (state, action) => {
            state.chartDataLoading = false;
            state.chartData = undefined;
            state.chartDataError = new Error(action.error.message);
        });
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

        builder.addCase(updateChartSortBy, (state, action) => {
            if (!state.fieldConfig) return;
            state.fieldConfig.sortBy = getNewSortBy(
                action.payload,
                state.fieldConfig.sortBy,
            );
        });
    },
});
export const { setGroupFieldIds, setYAxisReference, setYAxisAggregation } =
    pieChartConfigSlice.actions;
