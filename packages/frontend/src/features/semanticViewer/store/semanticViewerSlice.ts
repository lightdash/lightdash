import {
    ChartKind,
    type DimensionType,
    type ResultRow,
    type SemanticLayerField,
    type SemanticLayerSortBy,
    type SemanticLayerTimeDimension,
    type SqlColumn,
    type SqlTableConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export enum EditorTabs {
    SQL = 'sql',
    VISUALIZATION = 'visualization',
}

export enum SidebarTabs {
    TABLES = 'tables',
    VISUALIZATION = 'visualization',
}
const sanitizeFieldId = (fieldId: string) => fieldId.replace('.', '_');

export interface SemanticViewerState {
    projectUuid: string;

    view: string | undefined;
    activeEditorTab: EditorTabs;
    activeSidebarTab: SidebarTabs;
    selectedChartType: ChartKind | undefined;

    resultsTableConfig: SqlTableConfig | undefined;

    results: ResultRow[];
    columns: SqlColumn[];
    selectedDimensions: Pick<SemanticLayerField, 'name'>[];
    selectedTimeDimensions: Pick<
        SemanticLayerTimeDimension,
        'name' | 'granularity'
    >[];
    selectedMetrics: Pick<SemanticLayerField, 'name'>[];

    sortBy: SemanticLayerSortBy[];
}

const initialState: SemanticViewerState = {
    projectUuid: '',
    activeEditorTab: EditorTabs.VISUALIZATION,
    activeSidebarTab: SidebarTabs.TABLES,
    selectedChartType: ChartKind.TABLE,
    resultsTableConfig: undefined,

    view: undefined,

    selectedDimensions: [],
    selectedMetrics: [],
    selectedTimeDimensions: [],

    results: [],
    columns: [],
    sortBy: [],
};

export type ResultsAndColumns = {
    results: ResultRow[];
    columns: SqlColumn[];
    sortBy: [];
};

export const semanticViewerSlice = createSlice({
    name: 'semanticViewer',
    initialState,
    reducers: {
        resetState: () => {
            return initialState;
        },
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        enterView: (state, action: PayloadAction<string>) => {
            state.view = action.payload;
        },
        exitView: (state) => {
            state.view = undefined;
            state.selectedDimensions = [];
            state.selectedMetrics = [];
            state.selectedTimeDimensions = [];
        },
        setResults: (
            state,
            action: PayloadAction<{
                results: ResultRow[];
                columns: SqlColumn[];
            }>,
        ) => {
            state.results = action.payload.results || [];
        },

        toggleDimension: (
            state,
            action: PayloadAction<Pick<SemanticLayerField, 'name' | 'kind'>>,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (
                state.selectedDimensions.some(
                    (f) => f.name === action.payload.name,
                )
            ) {
                state.selectedDimensions = state.selectedDimensions.filter(
                    (f) => f.name !== action.payload.name,
                );
            } else {
                state.selectedDimensions.push(action.payload);
            }
        },
        toggleTimeDimension: (
            state,
            action: PayloadAction<
                Pick<SemanticLayerTimeDimension, 'name' | 'granularity'>
            >,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (
                state.selectedTimeDimensions.some(
                    (f) => f.name === action.payload.name,
                )
            ) {
                state.selectedTimeDimensions =
                    state.selectedTimeDimensions.filter(
                        (f) => f.name !== action.payload.name,
                    );
            } else {
                state.selectedTimeDimensions.push(action.payload);
            }
        },
        toggleMetric: (
            state,
            action: PayloadAction<Pick<SemanticLayerField, 'name' | 'kind'>>,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            if (
                state.selectedMetrics.some(
                    (f) => f.name === action.payload.name,
                )
            ) {
                state.selectedMetrics = state.selectedMetrics.filter(
                    (f) => f.name !== action.payload.name,
                );
            } else {
                state.selectedMetrics.push(action.payload);
            }
        },
        setActiveEditorTab: (state, action: PayloadAction<EditorTabs>) => {
            state.activeEditorTab = action.payload;
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

        setSavedChartData: (state, action: PayloadAction<any>) => {
            console.debug('setSavedChartData state', state, action);
            throw new Error('Not implemented');
            /*state.savedSqlChart = action.payload;
            state.name = action.payload.name;
            state.description = action.payload.description || '';
            state.sql = action.payload.sql;
            state.limit = action.payload.limit || 500;
            state.selectedChartType =
                action.payload.config.type || ChartKind.VERTICAL_BAR;*/
        },
        setSelectedChartType: (state, action: PayloadAction<ChartKind>) => {
            state.selectedChartType = action.payload;
        },
        setFields: (state, action: PayloadAction<SemanticLayerField[]>) => {
            const sqlColumns: SqlColumn[] = action.payload.map((field) => ({
                reference: sanitizeFieldId(field.name),
                type: field.type as unknown as DimensionType,
            }));

            state.columns = sqlColumns;
        },
    },
});

export const {
    resetState,
    setProjectUuid,
    enterView,
    exitView,
    setResults,
    setActiveEditorTab,
    setSavedChartData,
    setSelectedChartType,
    setFields,
    toggleDimension,
    toggleTimeDimension,
    toggleMetric,
} = semanticViewerSlice.actions;
