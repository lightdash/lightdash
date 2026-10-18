import {
    formatSql,
    getFieldQuoteChar,
    getPipelineSqlChartSource,
    type ApiErrorDetail,
    type ChartConfig,
    type ChartType,
    type ParametersValuesMap,
    type ParameterValue,
    type RawResultRow,
    type ResultColumns,
    type SavedChart,
    type WarehouseTypes,
} from '@lightdash/common';
import type { PayloadAction, SerializedError } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { createSelector } from 'reselect';
import { type MonacoHighlightChar } from '../components/SqlEditor';
import { resolveSqlErrorPosition } from '../utils/sqlErrorPosition';
import {
    DEFAULT_SQL_RUNNER_CHART_CONFIG,
    toVizColumns,
} from '../viz/sqlRunnerChart';
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

export const compareSqlQueries = (
    previousSql: string,
    currentSql: string,
    warehouseConnectionType: WarehouseTypes | undefined,
): boolean => {
    return (
        formatSql(previousSql, warehouseConnectionType) !==
        formatSql(currentSql, warehouseConnectionType)
    );
};

export type SqlRunnerConnection = {
    warehouseConnectionUuid: string | null;
    name: string;
    warehouseType: WarehouseTypes;
};

export type SqlRunnerConnectionRoute =
    | { route: 'pending' }
    | { route: 'single' }
    | { route: 'multi'; connection: SqlRunnerConnection | null };

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    activeDatabase: string | undefined;
    /** The pipeline chart being edited; its single SQL node is the editor's statement. */
    savedChart: SavedChart | undefined;
    queryUuid: string | undefined;
    fileUrl: string | undefined;
    name: string;
    description: string;
    sql: string;
    successfulSqlQueries: WithHistory<string | undefined>;
    hasUnrunChanges: boolean;
    limit: number | undefined;
    activeSidebarTab: SidebarTabs;
    activeEditorTab: EditorTabs;
    /** The explorer chart config the result is drawn with, as a saved chart stores it. */
    chartConfig: ChartConfig;
    /** Field ids the chart groups by; a grouped chart re-pivots the result. */
    pivotDimensions: string[] | undefined;
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
    };
    quoteChar: string;
    warehouseConnectionType: WarehouseTypes | undefined;
    sqlColumns: ResultColumns | undefined;
    sqlRows: RawResultRow[] | undefined;
    sqlDurationMs: number | null;
    fetchResultsOnLoad: boolean;
    mode: 'default' | 'virtualView';
    queryIsLoading: boolean;
    queryError: ApiErrorDetail | SerializedError | Error | undefined;
    queryErrorProjectUuid: string | undefined;
    editorHighlightError: MonacoHighlightChar | undefined;
    // Asks the editor to move its cursor; the counter makes repeat requests distinct
    editorRevealRequest:
        | (MonacoHighlightChar & { requestId: number })
        | undefined;
    parameterValues: ParametersValuesMap;
    connectionRoute: SqlRunnerConnectionRoute;
}

export const initialState: SqlRunnerState = {
    mode: 'default',
    projectUuid: '',
    activeTable: undefined,
    activeSchema: undefined,
    activeDatabase: undefined,
    savedChart: undefined,
    queryUuid: undefined,
    fileUrl: undefined,
    name: '',
    description: '',
    sql: '',
    successfulSqlQueries: withHistory(undefined),
    hasUnrunChanges: false,
    limit: undefined,
    activeSidebarTab: SidebarTabs.TABLES,
    activeEditorTab: EditorTabs.SQL,
    chartConfig: DEFAULT_SQL_RUNNER_CHART_CONFIG,
    pivotDimensions: undefined,
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
    },
    quoteChar: '"',
    warehouseConnectionType: undefined,
    sqlColumns: undefined,
    sqlRows: undefined,
    sqlDurationMs: null,
    fetchResultsOnLoad: false,
    queryIsLoading: false,
    queryError: undefined,
    queryErrorProjectUuid: undefined,
    editorHighlightError: undefined,
    editorRevealRequest: undefined,
    parameterValues: {},
    connectionRoute: { route: 'pending' },
};

const connectionUuidOf = (
    connectionRoute: SqlRunnerConnectionRoute | undefined,
): string | null | undefined =>
    connectionRoute?.route === 'multi'
        ? connectionRoute.connection?.warehouseConnectionUuid
        : undefined;

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
        selectQueryUuid: (state) => state.queryUuid,
        selectChartConfig: (state) => state.chartConfig,
        selectPivotDimensions: (state) => state.pivotDimensions,
        selectActiveEditorTab: (state) => state.activeEditorTab,
        selectLimit: (state) => state.limit,
        selectSavedChart: (state) => state.savedChart,
        selectColumns: (state) => state.sqlColumns,
        selectRows: (state) => state.sqlRows,
        selectParameterValues: (state) => state.parameterValues,
        selectConnectionRoute: (state) =>
            state.connectionRoute ?? initialState.connectionRoute,
        selectSqlQueryResults: (state) => {
            if (state.sqlColumns === undefined || state.sqlRows === undefined) {
                return undefined;
            }
            return {
                columns: state.sqlColumns,
                fileUrl: state.fileUrl,
                results: state.sqlRows,
                durationMs: state.sqlDurationMs,
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
        updateParameterValue: (
            state,
            action: PayloadAction<{
                key: string;
                value: ParameterValue | null;
            }>,
        ) => {
            const { key, value } = action.payload;
            if (value) {
                state.parameterValues = {
                    ...state.parameterValues,
                    [key]: value,
                };
            } else {
                const newValues = { ...state.parameterValues };
                delete newValues[key];
                state.parameterValues = newValues;
            }
        },
        clearParameterValues: (state) => {
            state.parameterValues = {};
        },
        setParameterValues: (
            state,
            action: PayloadAction<ParametersValuesMap>,
        ) => {
            state.parameterValues = action.payload;
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

            const normalizedNewSql = formatSql(
                action.payload,
                state.warehouseConnectionType,
            );
            const normalizedCurrentSql = formatSql(
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
            }
            if (action.payload === EditorTabs.SQL) {
                state.activeSidebarTab = SidebarTabs.TABLES;
            }
        },
        /** Loads a pipeline chart whose single SQL node the editor edits. */
        setSavedChartData: (state, action: PayloadAction<SavedChart>) => {
            const chart = action.payload;
            const source = chart.pipeline
                ? getPipelineSqlChartSource(chart.pipeline)
                : null;
            state.savedChart = chart;
            state.name = chart.name;
            state.description = chart.description || '';
            if (source) {
                state.sql = source.sql;
                state.limit = source.limit;
            }
            state.chartConfig = chart.chartConfig;
            state.pivotDimensions = chart.pivotConfig?.columns;
        },
        setChartConfig: (state, action: PayloadAction<ChartConfig>) => {
            state.chartConfig = action.payload;
        },
        /** Switches the chart type; the explorer config fills the type's defaults from the result. */
        setChartType: (state, action: PayloadAction<ChartType>) => {
            if (state.chartConfig.type === action.payload) return;
            state.chartConfig = {
                type: action.payload,
                config: undefined,
            } as ChartConfig;
        },
        setPivotDimensions: (
            state,
            action: PayloadAction<string[] | undefined>,
        ) => {
            state.pivotDimensions =
                action.payload && action.payload.length > 0
                    ? action.payload
                    : undefined;
        },
        toggleActiveTable: (
            state,
            action: PayloadAction<
                { table: string; schema: string; database: string } | undefined
            >,
        ) => {
            state.activeTable = action.payload?.table;
            state.activeSchema = action.payload?.schema;
            state.activeDatabase = action.payload?.database;
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
        requestEditorReveal: (
            state,
            action: PayloadAction<MonacoHighlightChar>,
        ) => {
            state.editorRevealRequest = {
                ...action.payload,
                requestId: (state.editorRevealRequest?.requestId ?? 0) + 1,
            };
        },
        setConnectionRoute: (
            state,
            action: PayloadAction<SqlRunnerConnectionRoute>,
        ) => {
            const previous = connectionUuidOf(state.connectionRoute);
            const next = connectionUuidOf(action.payload);
            state.connectionRoute = action.payload;
            if (action.payload.route === 'multi' && action.payload.connection) {
                state.warehouseConnectionType =
                    action.payload.connection.warehouseType;
                state.quoteChar = getFieldQuoteChar(
                    action.payload.connection.warehouseType,
                );
            }
            if (previous !== undefined && previous !== next) {
                state.sqlColumns = undefined;
                state.sqlRows = undefined;
                state.sqlDurationMs = null;
                state.queryUuid = undefined;
                state.fileUrl = undefined;
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(runSqlQuery.pending, (state) => {
                state.queryIsLoading = true;
                state.queryError = undefined;
                state.queryErrorProjectUuid = undefined;
            })
            .addCase(runSqlQuery.fulfilled, (state, action) => {
                state.queryIsLoading = false;
                if (
                    action.payload.warehouseConnectionUuid !==
                    connectionUuidOf(state.connectionRoute)
                ) {
                    return;
                }
                state.sqlColumns = action.payload.columns;
                state.sqlRows = action.payload.results;
                state.sqlDurationMs = action.payload.durationMs;
                state.queryUuid = action.payload.queryUuid;
                state.fileUrl = action.payload.fileUrl;
                state.editorHighlightError = undefined;

                if (
                    action.payload.results.length === 0 ||
                    Object.keys(action.payload.columns).length === 0
                ) {
                    return;
                }

                if (!!state.sql) {
                    sqlHistoryReducer.addToHistory(state.successfulSqlQueries, {
                        payload: {
                            value: state.sql,
                            compareFunc: (a, b) =>
                                formatSql(
                                    a || '',
                                    state.warehouseConnectionType,
                                ) !==
                                formatSql(
                                    b || '',
                                    state.warehouseConnectionType,
                                ),
                        },
                        type: 'sql',
                    });
                    state.hasUnrunChanges = false;
                }
            })
            .addCase(runSqlQuery.rejected, (state, action) => {
                state.queryIsLoading = false;
                // A cancelled run is not an error; the previous results stand
                if (action.meta.aborted) return;
                state.queryErrorProjectUuid = action.meta.arg.projectUuid;
                state.queryError =
                    action.payload ??
                    action.error ??
                    new Error('Unexpected query error');

                state.editorHighlightError =
                    action.payload?.data &&
                    action.payload.data.lineNumber !== undefined
                        ? resolveSqlErrorPosition(action.meta.arg.sql, {
                              lineNumber: Number(
                                  action.payload.data.lineNumber,
                              ),
                              charNumber: Number(
                                  action.payload.data.charNumber,
                              ),
                          })
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
    setChartConfig,
    setChartType,
    setPivotDimensions,
    toggleModal,
    resetState,
    setQuoteChar,
    setWarehouseConnectionType,
    setMode,
    setEditorHighlightError,
    requestEditorReveal,
    setState,
    updateParameterValue,
    clearParameterValues,
    setParameterValues,
    setConnectionRoute,
} = sqlRunnerSlice.actions;

export const {
    selectFetchResultsOnLoad,
    selectSql,
    selectQueryUuid,
    selectProjectUuid,
    selectChartConfig,
    selectPivotDimensions,
    selectLimit,
    selectActiveEditorTab,
    selectSavedChart,
    selectSqlQueryResults,
    selectParameterValues,
    selectConnectionRoute,
} = sqlRunnerSlice.selectors;

export const selectIsConnectionReady = createSelector(
    [sqlRunnerSlice.selectors.selectConnectionRoute],
    (connectionRoute) =>
        connectionRoute.route === 'single' ||
        (connectionRoute.route === 'multi' &&
            connectionRoute.connection !== null),
);

export const selectConnectionUuid = createSelector(
    [sqlRunnerSlice.selectors.selectConnectionRoute],
    (connectionRoute) => connectionUuidOf(connectionRoute),
);

export type SqlRunnerConnectionRequest =
    | { ready: true; field: { warehouseConnectionUuid?: string | null } }
    | { ready: false };

export const selectConnectionRequest = createSelector(
    [sqlRunnerSlice.selectors.selectConnectionRoute],
    (connectionRoute): SqlRunnerConnectionRequest => {
        if (connectionRoute.route === 'single')
            return { ready: true, field: {} };
        if (connectionRoute.route === 'multi' && connectionRoute.connection) {
            return {
                ready: true,
                field: {
                    warehouseConnectionUuid:
                        connectionRoute.connection.warehouseConnectionUuid,
                },
            };
        }
        return { ready: false };
    },
);

/** The result's columns in the shape virtual views and dbt write-back send. */
export const selectSqlVizColumns = createSelector(
    [sqlRunnerSlice.selectors.selectColumns],
    (columns) => (columns ? toVizColumns(columns) : undefined),
);
