import {
    isPieChartSQLConfig,
    PieChartDataTransformer,
    VIZ_DEFAULT_AGGREGATION,
    type PieChartSqlConfig,
    type VizAggregationOptions,
    type VizIndexLayoutOptions,
    type VizIndexType,
    type VizSqlCartesianChartLayout,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { setSavedChartData } from '../../../features/sqlRunner/store/sqlRunnerSlice';
import { onResults } from './cartesianChartBaseSlice';

type InitialState = {
    defaultFieldConfig: VizSqlCartesianChartLayout | undefined;
    config: PieChartSqlConfig | undefined;
    options: {
        groupFieldOptions: VizIndexLayoutOptions[];
        metricFieldOptions: VizValuesLayoutOptions[];
    };
};

const initialState: InitialState = {
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
            action: PayloadAction<{
                reference: string;
                type: VizIndexType;
            }>,
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
            if (action.payload) {
                const pieChartModel = new PieChartDataTransformer({
                    transformer: action.payload.transformer,
                });
                if (action.payload) {
                    state.options = {
                        groupFieldOptions:
                            action.payload.transformer.pivotChartIndexLayoutOptions(),
                        metricFieldOptions:
                            action.payload.transformer.pivotChartValuesLayoutOptions(),
                    };
                }

                state.config = pieChartModel.mergeConfig(state.config);
            }
        });
        builder.addCase(setSavedChartData, (state, action) => {
            if (isPieChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });
    },
});
export const { setGroupFieldIds, setYAxisReference, setYAxisAggregation } =
    pieChartConfigSlice.actions;
