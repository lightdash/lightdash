import {
    assertUnreachable,
    ChartKind,
    FieldType,
    SemanticLayerFieldType,
    SortByDirection,
    type RawResultRow,
    type SavedSemanticViewerChart,
    type SavedSemanticViewerChartResults,
    type SemanticLayerClientInfo,
    type SemanticLayerField,
    type SemanticLayerFilter,
    type SemanticLayerQuery,
    type SemanticLayerTimeDimension,
    type VizColumn,
    type VizTableConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export enum EditorTabs {
    QUERY = 'query',
    VIZ = 'viz',
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
) => {
    switch (field.kind) {
        case FieldType.DIMENSION:
            switch (field.type) {
                case SemanticLayerFieldType.TIME:
                    return 'timeDimensions';
                case SemanticLayerFieldType.STRING:
                case SemanticLayerFieldType.NUMBER:
                case SemanticLayerFieldType.BOOLEAN:
                    return 'dimensions';
                default:
                    return assertUnreachable(
                        field.type,
                        `Unknown field type: ${field.type}`,
                    );
            }
        case FieldType.METRIC:
            return 'metrics';
        default:
            return assertUnreachable(
                field.kind,
                `Unknown field kind: ${field.kind}`,
            );
    }
};

export type ResultsAndColumns = {
    results: RawResultRow[];
    columns: VizColumn[];
    sortBy: [];
};

export enum SemanticViewerStateStatus {
    LOADING,
    INITIALIZED,
}

export interface SemanticViewerState {
    status: SemanticViewerStateStatus;

    info: undefined | (SemanticLayerClientInfo & { projectUuid: string });

    name: string;
    saveModalOpen: boolean;

    activeEditorTab: EditorTabs;
    activeSidebarTab: SidebarTabs;
    activeChartKind: ChartKind | undefined;

    resultsTableConfig: VizTableConfig | undefined;

    results: RawResultRow[];
    columns: VizColumn[];
    columnNames: string[];

    fields: SemanticLayerField[];

    savedSemanticViewerChartUuid: string | undefined;
    semanticLayerView: string | undefined;
    semanticLayerQuery: SemanticLayerQuery;

    isFiltersModalOpen: boolean;
}

const initialState: SemanticViewerState = {
    status: SemanticViewerStateStatus.LOADING,

    info: undefined,

    name: '',
    savedSemanticViewerChartUuid: undefined,
    semanticLayerView: undefined,
    semanticLayerQuery: {
        dimensions: [],
        metrics: [],
        timeDimensions: [],
        filters: [],
        sortBy: [],
        limit: 500,
    },

    saveModalOpen: false,

    activeEditorTab: EditorTabs.QUERY,
    activeSidebarTab: SidebarTabs.TABLES,
    activeChartKind: undefined,

    resultsTableConfig: undefined,

    results: [],
    columns: [],
    columnNames: [],
    fields: [],

    isFiltersModalOpen: false,
};

export const semanticViewerSlice = createSlice({
    name: 'semanticViewer',
    initialState,
    reducers: {
        resetState: () => {
            return initialState;
        },
        initializeSemanticViewer: (
            state,
            action: PayloadAction<{
                projectUuid: string;
                info: SemanticLayerClientInfo;
                chartData:
                    | {
                          chart: SavedSemanticViewerChart;
                          results: SavedSemanticViewerChartResults | undefined;
                      }
                    | undefined;
            }>,
        ) => {
            const { projectUuid, info, chartData } = action.payload;

            state.info = { ...info, projectUuid };

            if (chartData) {
                state.savedSemanticViewerChartUuid =
                    chartData.chart.savedSemanticViewerChartUuid;
                state.name = chartData.chart.name;
                state.semanticLayerQuery = chartData.chart.semanticLayerQuery;
                state.semanticLayerView =
                    chartData.chart.semanticLayerView ?? '';
                state.activeChartKind = chartData.chart.chartKind;

                if (chartData.results) {
                    state.results = chartData.results.results;
                    state.columnNames = chartData.results.columns.map(
                        (column) => column,
                    );
                }
            }

            state.status = SemanticViewerStateStatus.INITIALIZED;
        },
        updateName: (state, action: PayloadAction<string>) => {
            state.name = action.payload;
        },
        enterView: (state, action: PayloadAction<string>) => {
            state.semanticLayerView = action.payload;
        },
        setResults: (
            state,
            action: PayloadAction<{
                results: RawResultRow[];
                columnNames: string[];
                columns: VizColumn[];
            }>,
        ) => {
            state.results = action.payload.results || [];
            state.columnNames = action.payload.columnNames;
            state.columns = action.payload.columns;
        },

        selectField: (
            state,
            action: PayloadAction<SemanticLayerStatePayloadField>,
        ) => {
            const key = getKeyByField(action.payload);
            state.semanticLayerQuery[key].push({ name: action.payload.name });

            const fieldDefaultSortBy = {
                name: action.payload.name,
                kind: action.payload.kind,
                direction: SortByDirection.DESC,
            };

            // If no sorts, add this field as the sort
            if (state.semanticLayerQuery.sortBy.length === 0) {
                state.semanticLayerQuery.sortBy = [fieldDefaultSortBy];
            } else if (
                // If sort is on a metric, and this is a dimension, replace sort with this field
                state.semanticLayerQuery.sortBy[0].kind === FieldType.METRIC &&
                action.payload.kind === FieldType.DIMENSION
            ) {
                state.semanticLayerQuery.sortBy = [fieldDefaultSortBy];
            } else if (
                state.semanticLayerQuery.sortBy[0].kind ===
                    FieldType.DIMENSION &&
                !isSemanticLayerStateTimeDimension(
                    state.semanticLayerQuery.sortBy[0],
                ) &&
                isSemanticLayerStateTimeDimension(action.payload)
            ) {
                // If sort is on a dimension, and this is a time dimension, replace sort with this field
                state.semanticLayerQuery.sortBy = [fieldDefaultSortBy];
            }
        },
        deselectField: (
            state,
            action: PayloadAction<SemanticLayerStatePayloadField>,
        ) => {
            const key = getKeyByField(action.payload);

            state.semanticLayerQuery[key] = state.semanticLayerQuery[
                key
            ].filter((field) => field.name !== action.payload.name);

            state.semanticLayerQuery.sortBy =
                state.semanticLayerQuery.sortBy.filter(
                    (sort) => sort.name !== action.payload.name,
                );
        },
        updateTimeDimensionGranularity: (
            state,
            action: PayloadAction<SemanticLayerStatePayloadTimeDimension>,
        ) => {
            state.semanticLayerQuery.timeDimensions =
                state.semanticLayerQuery.timeDimensions.map((timeDimension) => {
                    if (timeDimension.name === action.payload.name) {
                        return {
                            ...timeDimension,
                            granularity: action.payload.granularity,
                        };
                    }
                    return timeDimension;
                });
        },
        setActiveEditorTab: (state, action: PayloadAction<EditorTabs>) => {
            state.activeEditorTab = action.payload;

            if (action.payload === EditorTabs.QUERY) {
                state.activeSidebarTab = SidebarTabs.TABLES;
            }
            if (action.payload === EditorTabs.VIZ) {
                state.activeSidebarTab = SidebarTabs.VISUALIZATION;

                if (!state.activeChartKind) {
                    state.activeChartKind = ChartKind.VERTICAL_BAR;
                }
            }
        },

        setLimit: (state, action: PayloadAction<number>) => {
            state.semanticLayerQuery.limit = action.payload;
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
            state.fields = action.payload;
        },
        setFilters: (state, action: PayloadAction<SemanticLayerFilter[]>) => {
            state.semanticLayerQuery.filters = action.payload;
        },
        updateFilter: (state, action: PayloadAction<SemanticLayerFilter>) => {
            const filterIndex = state.semanticLayerQuery.filters.findIndex(
                (filter) => filter.uuid === action.payload.uuid,
            );

            if (filterIndex !== -1) {
                state.semanticLayerQuery.filters[filterIndex] = action.payload;
            }
        },
        setIsFiltersModalOpen: (state, action: PayloadAction<boolean>) => {
            state.isFiltersModalOpen = action.payload;
        },
        addFilterAndOpenModal: (
            state,
            action: PayloadAction<SemanticLayerFilter>,
        ) => {
            state.semanticLayerQuery.filters.push(action.payload);
            state.isFiltersModalOpen = true;
        },

        updateSortBy: (
            state,
            action: PayloadAction<{
                name: string;
                kind: FieldType;
            }>,
        ) => {
            const { name, kind } = action.payload;
            const existing = state.semanticLayerQuery.sortBy.find(
                (sort) => sort.name === name && sort.kind === kind,
            );

            if (!existing) {
                state.semanticLayerQuery.sortBy = [
                    {
                        name,
                        kind,
                        direction: SortByDirection.DESC,
                    },
                ];
            } else if (
                existing &&
                existing.direction === SortByDirection.DESC
            ) {
                existing.direction = SortByDirection.ASC;
            } else {
                state.semanticLayerQuery.sortBy = [];
            }
        },
        updateSaveModalOpen: (state, action: PayloadAction<boolean>) => {
            state.saveModalOpen = action.payload;
        },
    },
});

export const {
    resetState,
    initializeSemanticViewer,
    enterView,
    updateName,
    updateSaveModalOpen,
    setResults,
    setActiveEditorTab,
    setActiveChartKind,
    setFields,
    selectField,
    deselectField,
    setLimit,
    updateTimeDimensionGranularity,
    setFilters,
    setIsFiltersModalOpen,
    addFilterAndOpenModal,
    updateSortBy,
} = semanticViewerSlice.actions;
