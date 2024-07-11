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
    savedChartUuid: string | undefined;
    selectedChartType: SqlRunnerChartType;

    resultsTableConfig: TableChartSqlConfig | undefined;
    chartConfig: BarChartConfig | undefined;
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
    selectedChartType: SqlRunnerChartType.TABLE,
    resultsTableConfig: undefined,
    chartConfig: undefined,
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
        setSavedChartUuid: (state, action: PayloadAction<string>) => {
            state.savedChartUuid = action.payload;
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
            state.resultsTableConfig = {
                columns,
            };

            // TODO: this initialization should be put somewhere it
            // can be shared between the frontend and backend
            const fieldIds = Object.keys(action.payload[0]);
            state.chartConfig = {
                metadata: {
                    version: 1,
                },
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
        updateChartAxisLabel: (
            state,
            action: PayloadAction<{ reference: string; label: string }>,
        ) => {
            if (!state.chartConfig) {
                return;
            }
            const { reference, label } = action.payload;
            if (state.chartConfig.axes.x.reference === reference) {
                state.chartConfig.axes.x.label = label;
            } else {
                const index = state.chartConfig.axes.y.findIndex(
                    (axis) => axis.reference === reference,
                );
                state.chartConfig.axes.y[index].label = label;
            }
        },
        updateChartSeriesLabel: (
            state,
            action: PayloadAction<{ index: number; name: string }>,
        ) => {
            if (!state.chartConfig) return;
            const { index, name } = action.payload;
            state.chartConfig.series[index].name = name;
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
    setInitialResultsAndSeries,
    setSavedChartUuid,
    updateResultsTableFieldConfigLabel,
    updateChartAxisLabel,
    updateChartSeriesLabel,
    setSelectedChartType,
    toggleModal,
} = sqlRunnerSlice.actions;
