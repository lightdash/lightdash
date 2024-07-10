import { type ResultRow } from '@lightdash/common';
import { type BarChartConfig } from '@lightdash/common/src/types/visualizations';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { type TableChartSqlConfig } from '../transformers/TableDataTransformer';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    resultsTableConfig: TableChartSqlConfig | undefined;
    chartConfig: BarChartConfig;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    resultsTableConfig: undefined,
    chartConfig: {
        metadata: {
            version: 1,
        },
        style: {
            legend: {
                position: 'top',
                align: 'start',
            },
        },
        axes: {
            x: {},
            y: [],
        },
        series: [],
    },
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
            const columns = Object.keys(action.payload[0]).reduce<
                TableChartSqlConfig['columns']
            >(
                (acc, key) => ({
                    ...acc,
                    [key]: {
                        visible: true,
                        reference: key,
                        label: key,
                        frozen: true,
                        order: undefined,
                    },
                }),
                {},
            );

            state.resultsTableConfig = {
                columns,
            };
        },
        updateResultsTableFieldConfigLabel: (
            state,
            action: PayloadAction<Record<'reference' | 'label', string>>,
        ) => {
            const { reference, label } = action.payload;
            if (state.resultsTableConfig) {
                state.resultsTableConfig.columns[reference].label = label;
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
