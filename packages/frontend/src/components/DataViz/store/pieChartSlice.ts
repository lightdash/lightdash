import {
    isPieChartSQLConfig,
    PieChartDataTransformer,
    type IndexLayoutOptions,
    type PieChartSqlConfig,
    type SqlPivotChartLayout,
    type ValuesLayoutOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import {
    setSavedChartData,
    setSqlRunnerResults,
} from '../../../features/sqlRunner/store/sqlRunnerSlice';
import { SqlRunnerResultsTransformerFE } from '../../../features/sqlRunner/transformers/SqlRunnerResultsTransformerFE';

type InitialState = {
    defaultFieldConfig: SqlPivotChartLayout | undefined;
    config: PieChartSqlConfig | undefined;
    options: {
        groupFieldOptions: IndexLayoutOptions[];
        metricFieldOptions: ValuesLayoutOptions[];
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
            action: PayloadAction<SqlPivotChartLayout['x']>,
        ) => {
            if (config?.fieldConfig?.x) {
                config.fieldConfig.x = {
                    reference: action.payload.reference,
                    type: action.payload.type,
                };
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (action.payload) {
                const sqlRunnerResultsTransformer =
                    new SqlRunnerResultsTransformerFE({
                        rows: action.payload.results,
                        columns: action.payload.columns,
                    });
                const pieChartModel = new PieChartDataTransformer({
                    transformer: sqlRunnerResultsTransformer,
                });
                if (action.payload.columns) {
                    state.options = {
                        groupFieldOptions:
                            sqlRunnerResultsTransformer.pivotChartIndexLayoutOptions(),
                        metricFieldOptions:
                            sqlRunnerResultsTransformer.pivotChartValuesLayoutOptions(),
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
export const { setGroupFieldIds } = pieChartConfigSlice.actions;
