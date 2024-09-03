import {
    assertUnreachable,
    ChartKind,
    DimensionType,
    FieldType,
    SemanticLayerFieldType,
    type RawResultRow,
    type SemanticLayerClientInfo,
    type SemanticLayerField,
    type SemanticLayerFilter,
    type SemanticLayerSortBy,
    type SemanticLayerTimeDimension,
    type VizSqlColumn,
    type VizTableConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export enum EditorTabs {
    RESULTS = 'results',
    VISUALIZATION = 'visualization',
}

export enum SidebarTabs {
    TABLES = 'tables',
    VISUALIZATION = 'visualization',
}
type SemanticLayerStatePayloadDimension = Pick<
    SemanticLayerField,
    'name' | 'kind' | 'type'
>;
type SemanticLayerStatePayloadTimeDimension = Pick<
    SemanticLayerTimeDimension,
    'name' | 'kind' | 'type' | 'granularity'
>;
type SemanticLayerStatePayloadMetric = Pick<
    SemanticLayerField,
    'name' | 'kind' | 'type'
>;

type SemanticLayerStatePayloadField =
    | SemanticLayerStatePayloadDimension
    | SemanticLayerStatePayloadTimeDimension
    | SemanticLayerStatePayloadMetric;

type SemanticLayerStateDimension = Pick<SemanticLayerField, 'name'>;
type SemanticLayerStateMetric = Pick<SemanticLayerField, 'name'>;
type SemanticLayerStateTimeDimension = Pick<
    SemanticLayerTimeDimension,
    'name' | 'granularity'
>;

type SemanticLayerStateField =
    | SemanticLayerStateDimension
    | SemanticLayerStateMetric
    | SemanticLayerStateTimeDimension;

export const isSemanticLayerStateTimeDimension = (
    field: SemanticLayerStateField,
): field is SemanticLayerStateTimeDimension => {
    return 'granularity' in field;
};

const getKeyByField = (
    field:
        | Pick<SemanticLayerField, 'name' | 'kind' | 'type'>
        | Pick<
              SemanticLayerTimeDimension,
              'name' | 'kind' | 'type' | 'granularity'
          >,
): 'selectedDimensions' | 'selectedTimeDimensions' | 'selectedMetrics' => {
    switch (field.kind) {
        case FieldType.DIMENSION:
            switch (field.type) {
                case SemanticLayerFieldType.TIME:
                    return 'selectedTimeDimensions';
                case SemanticLayerFieldType.STRING:
                case SemanticLayerFieldType.NUMBER:
                case SemanticLayerFieldType.BOOLEAN:
                    return 'selectedDimensions';
                default:
                    return assertUnreachable(
                        field.type,
                        `Unknown field type: ${field.type}`,
                    );
            }
        case FieldType.METRIC:
            return 'selectedMetrics';
        default:
            return assertUnreachable(
                field.kind,
                `Unknown field kind: ${field.kind}`,
            );
    }
};

function getDimensionTypeFromSemanticLayerFieldType(
    type: SemanticLayerFieldType,
): DimensionType {
    switch (type) {
        case SemanticLayerFieldType.TIME:
            return DimensionType.TIMESTAMP;
        case SemanticLayerFieldType.STRING:
            return DimensionType.STRING;
        case SemanticLayerFieldType.NUMBER:
            return DimensionType.NUMBER;
        case SemanticLayerFieldType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
}

export type ResultsAndColumns = {
    results: RawResultRow[];
    columns: VizSqlColumn[];
    sortBy: [];
};

export enum SemanticViewerStateStatus {
    LOADING,
    INITIALIZED,
}

export interface SemanticViewerState {
    status: SemanticViewerStateStatus;

    info: undefined | (SemanticLayerClientInfo & { projectUuid: string });

    view: string | undefined;

    activeEditorTab: EditorTabs;
    activeSidebarTab: SidebarTabs;
    activeChartKind: ChartKind;

    resultsTableConfig: VizTableConfig | undefined;

    results: RawResultRow[];
    columns: VizSqlColumn[];
    fields: SemanticLayerField[];

    selectedDimensions: Record<string, SemanticLayerStateDimension>;
    selectedTimeDimensions: Record<string, SemanticLayerStateTimeDimension>;
    selectedMetrics: Record<string, SemanticLayerStateMetric>;

    limit: number | undefined;

    sortBy: SemanticLayerSortBy[];

    filters: SemanticLayerFilter[];

    isFiltersModalOpen: boolean;
}

const initialState: SemanticViewerState = {
    status: SemanticViewerStateStatus.LOADING,

    info: undefined,

    view: undefined,

    activeEditorTab: EditorTabs.RESULTS,
    activeSidebarTab: SidebarTabs.TABLES,
    activeChartKind: ChartKind.VERTICAL_BAR,

    resultsTableConfig: undefined,

    results: [],
    columns: [],
    fields: [],
    selectedDimensions: {},
    selectedMetrics: {},
    selectedTimeDimensions: {},

    limit: undefined,

    sortBy: [],
    filters: [],
    isFiltersModalOpen: false,
};

export const semanticViewerSlice = createSlice({
    name: 'semanticViewer',
    initialState,
    reducers: {
        resetState: () => {
            return initialState;
        },
        setSemanticLayerStatus: (
            state,
            action: PayloadAction<SemanticViewerStateStatus>,
        ) => {
            state.status = action.payload;
        },
        setSemanticLayerInfo: (
            state,
            action: PayloadAction<SemanticViewerState['info']>,
        ) => {
            state.info = action.payload;
        },
        enterView: (state, action: PayloadAction<string>) => {
            state.view = action.payload;
        },
        setResults: (
            state,
            action: PayloadAction<{
                results: RawResultRow[];
                columns: VizSqlColumn[];
            }>,
        ) => {
            state.results = action.payload.results || [];
        },

        selectField: (
            state,
            action: PayloadAction<SemanticLayerStatePayloadField>,
        ) => {
            const key = getKeyByField(action.payload);
            state[key][action.payload.name] = action.payload;
        },
        deselectField: (
            state,
            action: PayloadAction<SemanticLayerStatePayloadField>,
        ) => {
            const key = getKeyByField(action.payload);
            delete state[key][action.payload.name];
        },
        updateTimeDimensionGranularity: (
            state,
            action: PayloadAction<SemanticLayerStatePayloadTimeDimension>,
        ) => {
            const key = getKeyByField(action.payload);
            state[key][action.payload.name] = action.payload;
        },

        setActiveEditorTab: (state, action: PayloadAction<EditorTabs>) => {
            state.activeEditorTab = action.payload;

            if (action.payload === EditorTabs.RESULTS) {
                state.activeSidebarTab = SidebarTabs.TABLES;
            }
            if (action.payload === EditorTabs.VISUALIZATION) {
                state.activeSidebarTab = SidebarTabs.VISUALIZATION;
            }
        },

        setLimit: (state, action: PayloadAction<number>) => {
            state.limit = action.payload;
        },

        setSavedChartData: (state, action: PayloadAction<any>) => {
            console.debug('setSavedChartData state', state, action);
            throw new Error('Not implemented');
            /*state.savedSqlChart = action.payload;
            state.name = action.payload.name;
            state.description = action.payload.description || '';
            state.sql = action.payload.sql;
            state.limit = action.payload.limit || 500;
            state.activeChartKind =
                action.payload.config.type || ChartKind.VERTICAL_BAR;*/
        },
        setActiveChartKind: (state, action: PayloadAction<ChartKind>) => {
            state.activeChartKind = action.payload;
        },
        setFields: (state, action: PayloadAction<SemanticLayerField[]>) => {
            const sqlColumns: VizSqlColumn[] = action.payload.map((field) => ({
                reference: field.name,
                type: getDimensionTypeFromSemanticLayerFieldType(field.type),
            }));

            state.columns = sqlColumns;
            state.fields = action.payload;
        },
        addFilter: (state, action: PayloadAction<SemanticLayerFilter>) => {
            state.filters.push(action.payload);
        },
        removeFilter: (state, action: PayloadAction<string>) => {
            const filterIndex = state.filters.findIndex(
                (filter) => filter.uuid === action.payload,
            );

            if (filterIndex !== -1) {
                state.filters.splice(filterIndex, 1);
            }
        },
        updateFilter: (state, action: PayloadAction<SemanticLayerFilter>) => {
            const filterIndex = state.filters.findIndex(
                (filter) => filter.uuid === action.payload.uuid,
            );

            if (filterIndex !== -1) {
                state.filters[filterIndex] = action.payload;
            }
        },
        setIsFiltersModalOpen: (state, action: PayloadAction<boolean>) => {
            state.isFiltersModalOpen = action.payload;
        },
        addFilterAndOpenModal: (
            state,
            action: PayloadAction<SemanticLayerFilter>,
        ) => {
            state.filters.push(action.payload);
            state.isFiltersModalOpen = true;
        },
    },
});

export const {
    resetState,
    setSemanticLayerInfo,
    setSemanticLayerStatus,
    enterView,
    setResults,
    setActiveEditorTab,
    setActiveChartKind,
    setFields,
    selectField,
    deselectField,
    setLimit,
    updateTimeDimensionGranularity,
    addFilter,
    removeFilter,
    updateFilter,
    setIsFiltersModalOpen,
    addFilterAndOpenModal,
} = semanticViewerSlice.actions;
