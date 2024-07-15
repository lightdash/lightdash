import {
    ChartKind,
    type BarChartConfig,
    type ResultRow,
    type SqlChart,
    type SqlTableConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    savedChartUuid: string | undefined;
    name: string;
    sql: string;

    selectedChartType: ChartKind;

    resultsTableConfig: SqlTableConfig | undefined;
    barChartConfig: BarChartConfig | undefined;
    tableChartConfig: TableChartSqlConfig | undefined;

    modals: {
        saveChartModal: {
            isOpen: boolean;
        };
    };
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    savedChartUuid: undefined,
    name: 'Untitled SQL Query',
    sql: '',
    selectedChartType: ChartKind.VERTICAL_BAR,
    resultsTableConfig: undefined,
    barChartConfig: undefined,
    tableChartConfig: undefined,
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
        setInitialResultsAndSeries: (
            state,
            action: PayloadAction<ResultRow[]>,
        ) => {
            // Set the initial results table config
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
            // Set static results table
            state.resultsTableConfig = {
                columns,
            };

            // TODO: this initialization should be put somewhere it
            // can be shared between the frontend and backend
            if (state.tableChartConfig === undefined) {
                // Editable table chart
                state.tableChartConfig = {
                    type: ChartKind.TABLE,
                    metadata: {
                        version: 1,
                    },
                    columns,
                };
            }

            // TODO: this initialization should be put somewhere it
            // can be shared between the frontend and backend
            if (state.barChartConfig === undefined) {
                const fieldIds = Object.keys(action.payload[0]);
                state.barChartConfig = {
                    metadata: {
                        version: 1,
                    },
                    type: ChartKind.VERTICAL_BAR,
                    style: {
                        legend: {
                            position: 'top',
                            align: 'center',
                        },
                    },
                    axes: {
                        x: {
                            reference: fieldIds[0],
                            label: fieldIds[0],
                        },
                        y: [
                            {
                                reference: fieldIds[1],
                                label: fieldIds[1],
                            },
                        ],
                    },
                    series: fieldIds.slice(1).map((reference, index) => ({
                        reference,
                        name: reference,
                        yIndex: index,
                    })),
                };
            }
        },
        setSql: (state, action: PayloadAction<string>) => {
            state.sql = action.payload;
        },
        setSaveChartData: (state, action: PayloadAction<SqlChart>) => {
            state.savedChartUuid = action.payload.savedSqlUuid;
            state.name = action.payload.name;
            state.sql = action.payload.sql;
            state.selectedChartType =
                action.payload.config.type === ChartKind.TABLE
                    ? ChartKind.TABLE
                    : ChartKind.VERTICAL_BAR;
            if (action.payload.config.type === ChartKind.TABLE) {
                state.tableChartConfig = action.payload.config;
            } else if (action.payload.config.type === ChartKind.VERTICAL_BAR) {
                state.barChartConfig = action.payload.config;
            }
        },
        updateTableChartFieldConfigLabel: (
            state,
            action: PayloadAction<Record<'reference' | 'label', string>>,
        ) => {
            const { reference, label } = action.payload;
            if (state.tableChartConfig) {
                state.tableChartConfig.columns[reference].label = label;
            }
        },
        updateChartAxisLabel: (
            state,
            action: PayloadAction<{ reference: string; label: string }>,
        ) => {
            if (!state.barChartConfig) {
                return;
            }
            const { reference, label } = action.payload;
            if (state.barChartConfig.axes.x.reference === reference) {
                state.barChartConfig.axes.x.label = label;
            } else {
                const index = state.barChartConfig.axes.y.findIndex(
                    (axis) => axis.reference === reference,
                );
                state.barChartConfig.axes.y[index].label = label;
            }
        },
        updateChartSeriesLabel: (
            state,
            action: PayloadAction<{ index: number; name: string }>,
        ) => {
            if (!state.barChartConfig) return;
            const { index, name } = action.payload;
            state.barChartConfig.series[index].name = name;
        },
        setSelectedChartType: (state, action: PayloadAction<ChartKind>) => {
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
    setInitialResultsAndSeries,
    setSql,
    setSaveChartData,
    updateTableChartFieldConfigLabel,
    updateChartAxisLabel,
    updateChartSeriesLabel,
    setSelectedChartType,
    toggleModal,
} = sqlRunnerSlice.actions;
