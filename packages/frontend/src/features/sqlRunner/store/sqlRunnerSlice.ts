import {
    ChartKind,
    DimensionType,
    type BarChartConfig,
    type ResultRow,
    type SqlChart,
    type SqlTableConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import {
    xLayoutOptions,
    yLayoutOptions,
    type SqlColumn,
    type XLayoutOptions,
    type YLayoutOptions,
} from '../components/visualizations/barChartBizLogic';

export enum VisTabs {
    CHART = 'chart',
    RESULTS = 'results',
}

export const DEFAULT_NAME = 'Untitled SQL Query';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    savedSqlUuid: string | undefined;
    space:
        | {
              uuid: string;
              name: string;
          }
        | undefined;
    name: string;
    description: string;

    sql: string;

    activeVisTab: VisTabs;
    selectedChartType: ChartKind;

    resultsTableConfig: SqlTableConfig | undefined;
    barChartConfig: BarChartConfig | undefined;
    tableChartConfig: TableChartSqlConfig | undefined;

    modals: {
        saveChartModal: {
            isOpen: boolean;
        };
    };

    quoteChar: string;

    // TESTING
    barChartConfigOptions:
        | {
              xAxisOptions: XLayoutOptions[];
              yAxisOptions: YLayoutOptions[];
          }
        | undefined;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    savedSqlUuid: undefined,
    space: undefined,
    name: '',
    description: '',
    sql: '',
    activeVisTab: VisTabs.CHART,
    selectedChartType: ChartKind.VERTICAL_BAR,
    resultsTableConfig: undefined,
    barChartConfig: undefined,
    tableChartConfig: undefined,
    modals: {
        saveChartModal: {
            isOpen: false,
        },
    },
    quoteChar: '"',

    // TESTING
    barChartConfigOptions: undefined,
};

export const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        loadState: (state, action: PayloadAction<SqlRunnerState>) => {
            return action.payload;
        },
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

            // TESTING XLayoutOptions and YLayoutOptions
            const mockXLayoutData: SqlColumn[] = [
                {
                    id: 'order_id',
                    type: DimensionType.NUMBER,
                },
                {
                    id: 'customer_id',
                    type: DimensionType.NUMBER,
                },
                {
                    id: 'status',
                    type: DimensionType.STRING,
                },
                {
                    id: 'is_completed',
                    type: DimensionType.BOOLEAN,
                },
            ];

            state.barChartConfigOptions = {
                xAxisOptions: xLayoutOptions(mockXLayoutData),
                yAxisOptions: yLayoutOptions(mockXLayoutData),
            };

            // END - TESTING XLayoutOptions and YLayoutOptions

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
        updateName: (state, action: PayloadAction<string>) => {
            state.name = action.payload;
        },
        setSql: (state, action: PayloadAction<string>) => {
            state.sql = action.payload;
        },
        setActiveVisTab: (state, action: PayloadAction<VisTabs>) => {
            state.activeVisTab = action.payload;
        },
        setSaveChartData: (state, action: PayloadAction<SqlChart>) => {
            state.savedSqlUuid = action.payload.savedSqlUuid;
            state.name = action.payload.name;
            state.description = action.payload.description || '';
            state.space = action.payload.space;

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
            action: PayloadAction<{ reference?: string; label: string }>,
        ) => {
            if (!state.barChartConfig || !action.payload.reference) {
                return;
            }
            const { reference, label } = action.payload;
            if (state.barChartConfig?.axes?.x.reference === reference) {
                state.barChartConfig.axes.x.label = label;
            } else {
                const index = state.barChartConfig?.axes?.y.findIndex(
                    (axis) => axis.reference === reference,
                );

                if (
                    index !== undefined &&
                    state.barChartConfig?.axes?.y[index]
                ) {
                    state.barChartConfig.axes.y[index].label = label;
                }
            }
        },
        updateChartSeriesLabel: (
            state,
            action: PayloadAction<{ index: number; name: string }>,
        ) => {
            if (!state.barChartConfig) return;
            const { index, name } = action.payload;
            if (
                state.barChartConfig.series &&
                state.barChartConfig.series[index]
            ) {
                state.barChartConfig.series[index].name = name;
            }
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
        setQuoteChar: (state, action: PayloadAction<string>) => {
            state.quoteChar = action.payload;
        },
    },
});

export const {
    toggleActiveTable,
    setProjectUuid,
    setInitialResultsAndSeries,
    updateName,
    setSql,
    setActiveVisTab,
    setSaveChartData,
    updateTableChartFieldConfigLabel,
    updateChartAxisLabel,
    updateChartSeriesLabel,
    setSelectedChartType,
    toggleModal,
    loadState,
    setQuoteChar,
} = sqlRunnerSlice.actions;
