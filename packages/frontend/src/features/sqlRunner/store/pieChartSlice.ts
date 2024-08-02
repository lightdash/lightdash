import {
    ChartKind,
    deepEqual,
    isPieChartSQLConfig,
    type PieChartDimensionOptions,
    type PieChartMetricOptions,
    type PieChartSQLConfig,
    type SqlTransformPieChartConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { setSavedChartData, setSqlRunnerResults } from './sqlRunnerSlice';

type InitialState = {
    defaultFieldConfig: SqlTransformPieChartConfig | undefined;
    config: PieChartSQLConfig | undefined;
    options: {
        groupFieldOptions: PieChartDimensionOptions[];
        metricFieldOptions: PieChartMetricOptions[];
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
        setGroupFieldIds: ({ config }, action: PayloadAction<string>) => {
            if (config?.fieldConfig) {
                config.fieldConfig.groupFieldIds = [action.payload];
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (action.payload.results && action.payload.columns) {
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload.results,
                        columns: action.payload.columns,
                    });
                if (action.payload.columns) {
                    state.options = {
                        groupFieldOptions:
                            sqlRunnerResultsTransformer.pieChartGroupFieldOptions(),
                        metricFieldOptions:
                            sqlRunnerResultsTransformer.pieChartMetricFieldOptions(),
                    };
                }

                const oldDefaultConfig = state.defaultFieldConfig;
                const newDefaultConfig =
                    sqlRunnerResultsTransformer.defaultPieChartFieldConfig();
                state.defaultFieldConfig = newDefaultConfig;

                if (
                    !state.config ||
                    deepEqual(
                        oldDefaultConfig || {},
                        state.config?.fieldConfig || {},
                    )
                ) {
                    state.config = {
                        metadata: {
                            version: 1,
                        },
                        type: ChartKind.PIE,
                        fieldConfig: newDefaultConfig,
                        display: {
                            isDonut: false,
                        },
                    };
                }
            }
        });
        builder.addCase(setSavedChartData, (state, action) => {
            if (isPieChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });
    },
});

export const { setGroupFieldIds } = pieChartConfigSlice.actions;
