import {
    ChartKind,
    type SqlChart,
    type SqlColumn,
    type SqlTableConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { type ResultsAndColumns } from '../hooks/useSqlQueryRun';

export enum EditorTabs {
    SQL = 'sql',
    VISUALIZATION = 'visualization',
}

export const DEFAULT_NAME = 'Untitled SQL Query';

export interface SqlRunnerState {
    projectUuid: string;
    activeTable: string | undefined;
    savedSqlUuid: string | undefined;
    slug: string | undefined;
    space:
        | {
              uuid: string;
              name: string;
          }
        | undefined;
    name: string;
    description: string;

    sql: string;

    activeEditorTab: EditorTabs;
    selectedChartType: ChartKind;

    resultsTableConfig: SqlTableConfig | undefined;
    modals: {
        saveChartModal: {
            isOpen: boolean;
        };
        deleteChartModal: {
            isOpen: boolean;
        };
    };

    quoteChar: string;

    sqlColumns: SqlColumn[] | undefined;
}

const initialState: SqlRunnerState = {
    projectUuid: '',
    activeTable: undefined,
    savedSqlUuid: undefined,
    slug: undefined,
    space: undefined,
    name: '',
    description: '',
    sql: '',
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
    },
    quoteChar: '"',
    sqlColumns: undefined,
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
        setSqlRunnerResults: (
            state,
            action: PayloadAction<ResultsAndColumns>,
        ) => {
            if (!action.payload.results || !action.payload.columns) {
                return;
            }

            state.sqlColumns = action.payload.columns;
            // Set the initial results table config
            const columns = Object.keys(action.payload.results[0]).reduce<
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
        setActiveEditorTab: (state, action: PayloadAction<EditorTabs>) => {
            state.activeEditorTab = action.payload;
        },
        setSaveChartData: (state, action: PayloadAction<SqlChart>) => {
            state.savedSqlUuid = action.payload.savedSqlUuid;
            state.slug = action.payload.slug;
            state.name = action.payload.name;
            state.description = action.payload.description || '';
            state.space = action.payload.space;

            state.sql = action.payload.sql;
            state.selectedChartType =
                action.payload.config.type === ChartKind.TABLE
                    ? ChartKind.TABLE
                    : ChartKind.VERTICAL_BAR;
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
    setSqlRunnerResults,
    updateName,
    setSql,
    setActiveEditorTab,
    setSaveChartData,
    setSelectedChartType,
    toggleModal,
    loadState,
    setQuoteChar,
} = sqlRunnerSlice.actions;
