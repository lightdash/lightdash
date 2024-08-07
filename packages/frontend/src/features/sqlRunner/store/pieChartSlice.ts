import {
    isPieChartSQLConfig,
    PieChartDataTransformer,
    type PieChartDimensionOptions,
    type PieChartMetricOptions,
    type PieChartSqlConfig,
    type SqlPieChartConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { SqlRunnerResultsTransformerFE } from '../transformers/SqlRunnerResultsTransformerFE';
import { setSavedChartData, setSqlRunnerResults } from './sqlRunnerSlice';

type InitialState = {
    defaultFieldConfig: SqlPieChartConfig | undefined;
    config: PieChartSqlConfig | undefined;
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
            if (!config) return;

            if (!config.fieldConfig) {
                config.fieldConfig = {};
            }

            config.fieldConfig.groupFieldIds = [action.payload];
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

                const dataTransformer = new PieChartDataTransformer({
                    transformer: sqlRunnerResultsTransformer,
                });

                const { newConfig } = dataTransformer.getChartConfig({
                    currentConfig: state.config,
                });

                state.config = newConfig;
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
