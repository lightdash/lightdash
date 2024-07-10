import {
    SqlRunnerChartType,
    type BarChartConfig,
    type ResultRow,
    type TableChartSqlConfig,
} from '@lightdash/common';

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    selectedChartType: SqlRunnerChartType;

    resultsTableConfig: TableChartSqlConfig | undefined;
    chartConfig: BarChartConfig;
    modals: {
        saveChartModal: {
            isOpen: boolean;
        };
    };
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    selectedChartType: SqlRunnerChartType.TABLE,
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
    modals: {
        saveChartModal: {
            isOpen: false,
        },
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
        setSelectedChartType: (
            state,
            action: PayloadAction<SqlRunnerChartType>,
        ) => {
            state.selectedChartType = action.payload;
        },
        toggleActiveTable: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            state.activeTable = action.payload;
        },
        toggleModal: (
            state,
            action: PayloadAction<keyof SqlRunnerState['modals']>,
        ) => {
            state.modals[action.payload].isOpen =
                !state.modals[action.payload].isOpen;
        },
    },
});

export const {
    toggleActiveTable,
    setProjectUuid,
    setInitialResultsTableConfig,
    updateResultsTableFieldConfigLabel,
    setSelectedChartType,
    toggleModal,
} = sqlRunnerSlice.actions;
