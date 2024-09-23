import {
    ChartKind,
    type SqlChart,
    type VizColumn,
    type VizTableColumnsConfig,
    type VizTableConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { format } from 'sql-formatter';
import { type ResultsAndColumns } from '../hooks/useSqlQueryRun';
import { createHistoryReducer, withHistory, type WithHistory } from './history';

export enum EditorTabs {
    SQL = 'SQL',
    VISUALIZATION = 'Chart',
}

export enum SidebarTabs {
    TABLES = 'tables',
    VISUALIZATION = 'visualization',
}

/**
 * Normalizes the SQL by removing all whitespace and formatting it consistently - helpful for comparing two SQL queries
 * @param sql
 * @returns formatted SQL
 */
const normalizeSQL = (sql: string): string =>
    format(sql, {
        language: 'sql',
    });

export const DEFAULT_NAME = 'Untitled SQL Query';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    savedSqlChart: SqlChart | undefined;
    fileUrl: string | undefined;
    name: string;
    description: string;
    sql: string;
    successfulSqlQueries: WithHistory<string | undefined>;
    hasUnrunChanges: boolean;
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
        addToDashboard: {
            isOpen: boolean;
        };
        saveCustomExploreModal: {
            isOpen: boolean;
        };
        chartErrorsAlert: {
            isOpen: boolean;
        };
    };
    quoteChar: string;
    sqlColumns: VizColumn[] | undefined;
    activeConfigs: ChartKind[];
    fetchResultsOnLoad: boolean;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    activeSchema: undefined,
    savedSqlChart: undefined,
    fileUrl: undefined,
    name: '',
    description: '',
    sql: '',
    successfulSqlQueries: withHistory(undefined),
    hasUnrunChanges: false,
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
        addToDashboard: {
            isOpen: false,
        },
        saveCustomExploreModal: {
            isOpen: false,
        },
        chartErrorsAlert: {
            isOpen: false,
        },
    },
    quoteChar: '"',
    sqlColumns: undefined,
    activeConfigs: [ChartKind.VERTICAL_BAR],
    fetchResultsOnLoad: false,
};

const sqlHistoryReducer = createHistoryReducer<string | undefined>({
    maxHistoryItems: 5,
    compareFunc: (a, b) => normalizeSQL(a || '') !== normalizeSQL(b || ''),
});

export const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    reducers: {
        resetState: () => initialState,
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setFetchResultsOnLoad: (state, action: PayloadAction<boolean>) => {
            state.fetchResultsOnLoad = action.payload;
            if (action.payload === true) {
                state.activeEditorTab = EditorTabs.VISUALIZATION;
            }
        },
        setFileUrl: (state, action: PayloadAction<string>) => {
            state.fileUrl = action.payload;
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

            if (!!state.sql) {
                sqlHistoryReducer.addToHistory(state.successfulSqlQueries, {
                    payload: state.sql,
                    type: 'sql',
                });
                state.hasUnrunChanges = false;
            }
        },
        updateName: (state, action: PayloadAction<string>) => {
            state.name = action.payload;
        },
        setSql: (state, action: PayloadAction<string>) => {
            state.sql = action.payload;

            const normalizedNewSql = normalizeSQL(action.payload);
            const normalizedCurrentSql = normalizeSQL(
                state.successfulSqlQueries.current || '',
            );
            state.hasUnrunChanges = normalizedNewSql !== normalizedCurrentSql;
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
    setFileUrl,
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
