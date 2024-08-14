import {
    ChartKind,
    FieldType as FieldKind,
    SemanticLayerFieldType,
    type ResultRow,
    type SemanticLayerField,
    type SemanticLayerTimeDimension,
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
export interface SemanticViewerState {
    projectUuid: string;
    name: string;
    description: string;
    sql: string;
    limit: number;

    view: string | undefined;
    activeEditorTab: EditorTabs;
    activeSidebarTab: SidebarTabs;
    selectedChartType: ChartKind | undefined;

    selectedDimensions: Array<string>;
    selectedMetrics: Array<string>;
    resultsTableConfig: SqlTableConfig | undefined;
    selectedTimeDimensions: Array<SemanticLayerTimeDimension>;

    results: ResultRow[] | undefined;
    columns: SemanticLayerField[] | undefined;
}

const initialState: SemanticViewerState = {
    projectUuid: '',
    activeEditorTab: EditorTabs.VISUALIZATION,
    activeSidebarTab: SidebarTabs.TABLES,
    selectedChartType: ChartKind.TABLE,
    resultsTableConfig: undefined,
    name: '',
    description: '',
    sql: '',
    limit: 500,

    view: undefined,

    selectedDimensions: [],
    selectedMetrics: [],
    selectedTimeDimensions: [],

    results: undefined,
    columns: undefined,
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
        setResults: (state, action: PayloadAction<ResultRow[]>) => {
            state.results = action.payload;
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
        toggleField: (
            state,
            action: PayloadAction<
                Pick<SemanticLayerField, 'name' | 'kind' | 'type'>
            >,
        ) => {
            if (!state.view) {
                throw new Error('Impossible state');
            }

            console.log(action.payload);

            switch (action.payload.kind) {
                case FieldKind.DIMENSION:
                    if (action.payload.type === SemanticLayerFieldType.TIME) {
                        if (
                            state.selectedTimeDimensions.find(
                                (field) => field.name === action.payload.name,
                            )
                        ) {
                            state.selectedTimeDimensions =
                                state.selectedTimeDimensions.filter(
                                    (field) =>
                                        field.name !== action.payload.name,
                                );
                        } else {
                            state.selectedTimeDimensions.push({
                                name: action.payload.name,
                                granularity: undefined, // TODO: pass the selected granularity here
                            });
                        }
                        break;
                    }

                    if (
                        state.selectedDimensions.includes(action.payload.name)
                    ) {
                        state.selectedDimensions =
                            state.selectedDimensions.filter(
                                (field) => field !== action.payload.name,
                            );
                    } else {
                        state.selectedDimensions.push(action.payload.name);
                    }
                    break;
                case FieldKind.METRIC:
                    if (state.selectedMetrics.includes(action.payload.name)) {
                        state.selectedMetrics = state.selectedMetrics.filter(
                            (field) => field !== action.payload.name,
                        );
                    } else {
                        state.selectedMetrics.push(action.payload.name);
                    }
                    break;
                default:
                    throw new Error('Unknown field type');
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
    },
});

export const {
    resetState,
    setProjectUuid,
    enterView,
    exitView,
    toggleField,
    setResults,
    setActiveEditorTab,
    setSavedChartData,
    updateName,
    setSql,
    setSqlLimit,
    setSelectedChartType,
} = semanticViewerSlice.actions;
