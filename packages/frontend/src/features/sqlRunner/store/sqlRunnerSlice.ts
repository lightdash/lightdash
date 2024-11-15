import {
    ChartKind,
    WarehouseTypes,
    type ApiErrorDetail,
    type RawResultRow,
    type SqlChart,
    type VizColumn,
    type VizSortBy,
    type VizTableColumnsConfig,
    type VizTableConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { createSelector } from 'reselect';
import { format, type FormatOptionsWithLanguage } from 'sql-formatter';
import { type MonacoHighlightChar } from '../components/SqlEditor';
import { SqlRunnerResultsRunnerFrontend } from '../runners/SqlRunnerResultsRunnerFrontend';
import { createHistoryReducer, withHistory, type WithHistory } from './history';
import { runSqlQuery } from './thunks';

export enum EditorTabs {
    SQL = 'SQL',
    VISUALIZATION = 'Chart',
}

export enum SidebarTabs {
    TABLES = 'tables',
    VISUALIZATION = 'visualization',
}

const getLanguage = (
    warehouseConnectionType?: WarehouseTypes,
): FormatOptionsWithLanguage['language'] => {
    switch (warehouseConnectionType) {
        case WarehouseTypes.BIGQUERY:
            return 'bigquery';
        case WarehouseTypes.SNOWFLAKE:
            return 'snowflake';
        case WarehouseTypes.TRINO:
            return 'spark';
        case WarehouseTypes.DATABRICKS:
            return 'spark';
        case WarehouseTypes.POSTGRES:
            return 'postgresql';
        case WarehouseTypes.REDSHIFT:
            return 'redshift';
        default:
            return 'sql';
    }
};

/**
 * Normalizes the SQL by removing all whitespace and formatting it consistently - helpful for comparing two SQL queries
 * @param sql
 * @returns formatted SQL
 */
const normalizeSQL = (
    sql: string,
    warehouseConnectionType: WarehouseTypes | undefined,
): string => {
    try {
        return format(sql, {
            language: getLanguage(warehouseConnectionType),
        });
    } catch (error) {
        // Return the original SQL or a placeholder if formatting fails
        return sql;
    }
};

export const compareSqlQueries = (
    previousSql: string,
    currentSql: string,
    warehouseConnectionType: WarehouseTypes | undefined,
): boolean => {
    return (
        normalizeSQL(previousSql, warehouseConnectionType) !==
        normalizeSQL(currentSql, warehouseConnectionType)
    );
};

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
        createVirtualViewModal: {
            isOpen: boolean;
        };
        writeBackToDbtModal: {
            isOpen: boolean;
        };
        chartErrorsAlert: {
            isOpen: boolean;
        };
    };
    quoteChar: string;
    warehouseConnectionType: WarehouseTypes | undefined;
    sqlColumns: VizColumn[] | undefined;
    sqlRows: RawResultRow[] | undefined;
    activeConfigs: ChartKind[];
    fetchResultsOnLoad: boolean;
    mode: 'default' | 'virtualView';
    queryIsLoading: boolean;
    queryError: ApiErrorDetail | undefined;
    editorHighlightError: MonacoHighlightChar | undefined;
}

const initialState: SqlRunnerState = {
    mode: 'default',
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
        createVirtualViewModal: {
            isOpen: false,
        },
        writeBackToDbtModal: {
            isOpen: false,
        },
        chartErrorsAlert: {
            isOpen: false,
        },
    },
    quoteChar: '"',
    warehouseConnectionType: undefined,
    sqlColumns: undefined,
    sqlRows: undefined,
    activeConfigs: [ChartKind.VERTICAL_BAR],
    fetchResultsOnLoad: false,
    queryIsLoading: false,
    queryError: undefined,
    editorHighlightError: undefined,
};

const sqlHistoryReducer = createHistoryReducer<string | undefined>({
    maxHistoryItems: 5,
});

export const sqlRunnerSlice = createSlice({
    name: 'sqlRunner',
    initialState,
    selectors: {
        selectFetchResultsOnLoad: (state) => state.fetchResultsOnLoad,
        selectProjectUuid: (state) => state.projectUuid,
        selectSql: (state) => state.sql,
        selectActiveChartType: (state) => state.selectedChartType,
        selectActiveEditorTab: (state) => state.activeEditorTab,
        selectLimit: (state) => state.limit,
        selectResultsTableConfig: (state) => state.resultsTableConfig,
        selectSavedSqlChart: (state) => state.savedSqlChart,
        selectColumns: (state) => state.sqlColumns,
        selectRows: (state) => state.sqlRows,
        selectSqlQueryResults: (state) => {
            if (state.sqlColumns === undefined || state.sqlRows === undefined) {
                return undefined;
            }
            return {
                columns: state.sqlColumns,
                fileUrl: state.fileUrl,
                results: state.sqlRows,
            };
        },
    },
    reducers: {
        resetState: () => initialState,
        setState: (state, action: PayloadAction<typeof initialState>) => {
            return action.payload;
        },
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setFetchResultsOnLoad: (
            state,
            action: PayloadAction<{
                shouldFetch: boolean;
                shouldOpenChartOnLoad: boolean;
            }>,
        ) => {
            state.fetchResultsOnLoad = action.payload.shouldFetch;
            if (action.payload.shouldOpenChartOnLoad) {
                state.activeEditorTab = EditorTabs.VISUALIZATION;
            }
        },
        updateName: (state, action: PayloadAction<string>) => {
            state.name = action.payload;
        },
        setMode: (state, action: PayloadAction<'default' | 'virtualView'>) => {
            state.mode = action.payload;
        },
        setSql: (state, action: PayloadAction<string>) => {
            state.sql = action.payload;

            const normalizedNewSql = normalizeSQL(
                action.payload,
                state.warehouseConnectionType,
            );
            const normalizedCurrentSql = normalizeSQL(
                state.successfulSqlQueries.current || '',
                state.warehouseConnectionType,
            );
            state.hasUnrunChanges = compareSqlQueries(
                normalizedNewSql,
                normalizedCurrentSql,
                state.warehouseConnectionType,
            );
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
        setWarehouseConnectionType: (
            state,
            action: PayloadAction<WarehouseTypes>,
        ) => {
            state.warehouseConnectionType = action.payload;
        },
        setEditorHighlightError: (
            state,
            action: PayloadAction<MonacoHighlightChar | undefined>,
        ) => {
            state.editorHighlightError = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(runSqlQuery.pending, (state) => {
                state.queryIsLoading = true;
                state.queryError = undefined;
            })
            .addCase(runSqlQuery.fulfilled, (state, action) => {
                state.queryIsLoading = false;
                state.sqlColumns = action.payload.columns;
                state.sqlRows = action.payload.results;
                state.fileUrl = action.payload.fileUrl;
                state.editorHighlightError = undefined;

                // setSqlRunnerResults reducer logic moved here
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
                        payload: {
                            value: state.sql,
                            compareFunc: (a, b) =>
                                normalizeSQL(
                                    a || '',
                                    state.warehouseConnectionType,
                                ) !==
                                normalizeSQL(
                                    b || '',
                                    state.warehouseConnectionType,
                                ),
                        },
                        type: 'sql',
                    });
                    state.hasUnrunChanges = false;
                }
                state.sqlRows = action.payload.results;
                state.fileUrl = action.payload.fileUrl;
            })
            .addCase(runSqlQuery.rejected, (state, action) => {
                state.queryIsLoading = false;
                state.queryError = action.payload ?? undefined;

                state.editorHighlightError = action.payload?.data
                    ? {
                          line: Number(action.payload.data.lineNumber),
                          char: Number(action.payload.data.charNumber),
                      }
                    : undefined;
            });
    },
});

export const {
    toggleActiveTable,
    setProjectUuid,
    setFetchResultsOnLoad,
    updateName,
    setSql,
    setSqlLimit,
    setActiveEditorTab,
    setSavedChartData,
    setSelectedChartType,
    toggleModal,
    resetState,
    setQuoteChar,
    setWarehouseConnectionType,
    setMode,
    setEditorHighlightError,
    setState,
} = sqlRunnerSlice.actions;

export const {
    selectFetchResultsOnLoad,
    selectSql,
    selectProjectUuid,
    selectActiveChartType,
    selectLimit,
    selectResultsTableConfig,
    selectActiveEditorTab,
    selectSavedSqlChart,
    selectSqlQueryResults,
} = sqlRunnerSlice.selectors;

export const selectSqlRunnerResultsRunner = createSelector(
    [
        sqlRunnerSlice.selectors.selectColumns,
        sqlRunnerSlice.selectors.selectRows,
        selectProjectUuid,
        selectLimit,
        selectSql,
        (_state, sortBy?: VizSortBy[]) => sortBy,
    ],
    (columns, rows, projectUuid, limit, sql, sortBy) => {
        return new SqlRunnerResultsRunnerFrontend({
            columns: columns || [],
            rows: rows || [],
            projectUuid,
            limit,
            sql,
            sortBy,
        });
    },
);
