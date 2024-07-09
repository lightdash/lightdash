import { type ResultRow } from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { type TableChartSqlConfig } from '../transformers/TableDataTransformer';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    resultsTableConfig: TableChartSqlConfig | undefined;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    resultsTableConfig: undefined,
};

export const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setInitialResultsTableConfig: (
            state,
            action: PayloadAction<ResultRow[]>,
        ) => {
            state.resultsTableConfig = {
                columns: Object.entries<ResultRow>(action.payload).reduce<
                    TableChartSqlConfig['columns']
                >((acc, [key]) => {
                    acc[key] = {
                        visible: true,
                        reference: key,
                        label: key,
                        frozen: false,
                        order: undefined,
                    };
                    return acc;
                }, {}),
            };
        },
        updateResultsTableFieldConfigLabel: (
            state,
            action: PayloadAction<[string, string]>,
        ) => {
            if (state.resultsTableConfig) {
                state.resultsTableConfig.columns[action.payload[0]].label =
                    action.payload[1];
            }
        },
        toggleActiveTable: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            state.activeTable = action.payload;
        },
    },
});

export const {
    toggleActiveTable,
    setProjectUuid,
    setInitialResultsTableConfig,
    updateResultsTableFieldConfigLabel,
} = sqlRunnerSlice.actions;
