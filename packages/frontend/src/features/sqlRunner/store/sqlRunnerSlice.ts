import {
    ChartKind,
    type SqlChart,
    type VizSqlColumn,
    type VizTableColumnsConfig,
    type VizTableConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { type ResultsAndColumns } from '../hooks/useSqlQueryRun';

export enum EditorTabs {
    SQL = 'SQL',
    VISUALIZATION = 'Chart',
}

export enum SidebarTabs {
    TABLES = 'tables',
    VISUALIZATION = 'visualization',
}

export const DEFAULT_NAME = 'Untitled SQL Query';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    savedSqlChart: SqlChart | undefined;
    name: string;
    description: string;
    sql: string;
    limit: number;
    activeSidebarTab: SidebarTabs;
    activeEditorTab: EditorTabs;
    selectedChartType: ChartKind | undefined;
    resultsTableConfig: VizTableColumnsConfig | undefined;
    modals: {
        saveChartModal: {
            isOpen: boolean;
        };
        deleteChartModal: {
            isOpen: boolean;
        };
        updateChartModal: {
            isOpen: boolean;
        };
    };
    quoteChar: string;
    sqlColumns: VizSqlColumn[] | undefined;
    activeConfigs: ChartKind[];
    fetchResultsOnLoad: boolean;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    activeSchema: undefined,
    savedSqlChart: undefined,
    name: '',
    description: '',
    sql: '',
    limit: 500,
    activeSidebarTab: SidebarTabs.TABLES,
    activeEditorTab: EditorTabs.SQL,
    selectedChartType: ChartKind.VERTICAL_BAR,
    resultsTableConfig: undefined,
    modals: {
        saveChartModal: {
            isOpen: false,
        },
        deleteChartModal: {
            isOpen: false,
        },
        updateChartModal: {
            isOpen: false,
        },
    },
    quoteChar: '"',
    sqlColumns: undefined,
    activeConfigs: [ChartKind.VERTICAL_BAR],
    fetchResultsOnLoad: false,
};

export const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        resetState: () => {
            return initialState;
        },
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setFetchResultsOnLoad: (state, action: PayloadAction<boolean>) => {
            state.fetchResultsOnLoad = action.payload;
        },
        setSqlRunnerResults: (
            state,
            action: PayloadAction<ResultsAndColumns>,
        ) => {
            if (
                action.payload.results.length === 0 ||
                action.payload.columns.length === 0
            ) {
                return;
            }

            state.sqlColumns = action.payload.columns;
            // Set the initial results table config
            const columns = Object.keys(action.payload.results[0]).reduce<
                VizTableConfig['columns']
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
            // TODO: should this be in a separate slice?
            state.resultsTableConfig = {
                columns,
            };
        },
        updateName: (state, action: PayloadAction<string>) => {
            state.name = action.payload;
        },
        setSql: (state, action: PayloadAction<string>) => {
            state.sql = action.payload;
        },
        setSqlLimit: (state, action: PayloadAction<number>) => {
            state.limit = action.payload;
        },
        setActiveEditorTab: (state, action: PayloadAction<EditorTabs>) => {
            state.activeEditorTab = action.payload;
            if (
                state.fetchResultsOnLoad &&
                state.activeEditorTab === EditorTabs.SQL
            ) {
                state.fetchResultsOnLoad = false;
            }
            if (action.payload === EditorTabs.VISUALIZATION) {
                state.activeSidebarTab = SidebarTabs.VISUALIZATION;
                if (state.selectedChartType === undefined) {
                    state.selectedChartType = ChartKind.VERTICAL_BAR;
                }
            }
            if (action.payload === EditorTabs.SQL) {
                state.activeSidebarTab = SidebarTabs.TABLES;
            }
        },
        setSavedChartData: (state, action: PayloadAction<SqlChart>) => {
            state.savedSqlChart = action.payload;
            state.name = action.payload.name;
            state.description = action.payload.description || '';
            state.sql = action.payload.sql;
            state.limit = action.payload.limit || 500;
            state.selectedChartType =
                action.payload.config.type || ChartKind.VERTICAL_BAR;
            if (!state.activeConfigs.includes(action.payload.config.type)) {
                state.activeConfigs.push(action.payload.config.type);
            }
        },
        setSelectedChartType: (state, action: PayloadAction<ChartKind>) => {
            state.selectedChartType = action.payload;
            if (!state.activeConfigs.includes(action.payload)) {
                state.activeConfigs.push(action.payload);
            }
        },
        toggleActiveTable: (
            state,
            action: PayloadAction<
                { table: string; schema: string } | undefined
            >,
        ) => {
            state.activeTable = action.payload?.table;
            state.activeSchema = action.payload?.schema;
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
    setFetchResultsOnLoad,
    setSqlRunnerResults,
    updateName,
    setSql,
    setSqlLimit,
    setActiveEditorTab,
    setSavedChartData,
    setSelectedChartType,
    toggleModal,
    resetState,
    setQuoteChar,
} = sqlRunnerSlice.actions;
