import {
    ChartKind,
    isPieChartSQLConfig,
    VIZ_DEFAULT_AGGREGATION,
    type PieChartSqlConfig,
    type VizAggregationOptions,
    type VizIndexLayoutOptions,
    type VizSqlCartesianChartLayout,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { onResults, setChartConfig } from './actions/commonChartActions';

export type PieChartState = {
    defaultFieldConfig: VizSqlCartesianChartLayout | undefined;
    config: PieChartSqlConfig | undefined;
    options: {
        groupFieldOptions: VizIndexLayoutOptions[];
        metricFieldOptions: VizValuesLayoutOptions[];
    };
};

const initialState: PieChartState = {
    defaultFieldConfig: undefined,
    config: undefined,
    options: {
        groupFieldOptions: [],
        metricFieldOptions: [],
    },
};

export const pieChartConfigSlice = createSlice({
    name: 'pieChartConfig',
    initialState,
    reducers: {
        setGroupFieldIds: (
            { config },
            action: PayloadAction<VizSqlCartesianChartLayout['x']>,
        ) => {
            if (config?.fieldConfig?.x) {
                config.fieldConfig.x = {
                    reference: action.payload.reference,
                    type: action.payload.type,
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
            if (state.config?.fieldConfig?.y) {
                const yAxis = state.config.fieldConfig.y[action.payload.index];
                if (yAxis) {
                    yAxis.reference = action.payload.reference;
                    yAxis.aggregation =
                        state.options.metricFieldOptions.find(
                            (option) =>
                                option.reference === action.payload.reference,
                        )?.aggregationOptions[0] ?? VIZ_DEFAULT_AGGREGATION;
                }
            }
        },
        setYAxisAggregation: (
            { config },
            action: PayloadAction<{
                index: number;
                aggregation: VizAggregationOptions;
            }>,
        ) => {
            if (!config) return;
            if (!config?.fieldConfig?.y) return;

            const yAxis = config.fieldConfig.y[action.payload.index];
            if (yAxis) {
                yAxis.aggregation = action.payload.aggregation;
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(onResults, (state, action) => {
            if (action.payload.type === ChartKind.PIE) {
                state.options = action.payload.options;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isPieChartSQLConfig(action.payload)) {
                state.config = action.payload;
            }
        });
    },
});
export const { setGroupFieldIds, setYAxisReference, setYAxisAggregation } =
    pieChartConfigSlice.actions;
