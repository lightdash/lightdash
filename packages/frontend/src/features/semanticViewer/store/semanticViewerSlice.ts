import {
    ChartKind,
    FieldType as FieldKind,
    SemanticLayerFieldType,
    SqlTableConfig,
    type ResultRow,
    type SemanticLayerField,
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

    view: string | undefined;
    activeEditorTab: EditorTabs;
    activeSidebarTab: SidebarTabs;
    selectedChartType: ChartKind | undefined;

    selectedDimensions: Array<string>;
    selectedMetrics: Array<string>;
    selectedTimeDimensions: Array<string>;
    resultsTableConfig: SqlTableConfig | undefined;

    results: ResultRow[] | undefined;
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

    results: undefined,
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
                    const stateSelectedDimensionsArrayName: keyof typeof state =
                        action.payload.type === SemanticLayerFieldType.TIME
                            ? 'selectedTimeDimensions'
                            : 'selectedDimensions';

                    if (
                        state[stateSelectedDimensionsArrayName].includes(
                            action.payload.name,
                        )
                    ) {
                        state[stateSelectedDimensionsArrayName] = state[
                            stateSelectedDimensionsArrayName
                        ].filter((field) => field !== action.payload.name);
                    } else {
                        state[stateSelectedDimensionsArrayName].push(
                            action.payload.name,
                        );
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
        //TODO implement
        /*
        setSavedChartData: (state, action: PayloadAction<SqlChart>) => {
            state.savedSqlChart = action.payload;
            state.name = action.payload.name;
            state.description = action.payload.description || '';
            state.sql = action.payload.sql;
            state.limit = action.payload.limit || 500;
            state.selectedChartType =
                action.payload.config.type || ChartKind.VERTICAL_BAR;
        },*/
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
} = semanticViewerSlice.actions;
