import {
    AdditionalMetric,
    BigNumberConfig,
    CartesianChartConfig,
    ChartConfig,
    ChartType,
    CreateSavedChartVersion,
    CustomDimension,
    CustomVisConfig,
    Dimension,
    FieldId,
    MetricQuery,
    MetricType,
    PieChartConfig,
    SavedChart,
    SortField,
    TableCalculation,
    TableChartConfig,
} from '@lightdash/common';
import {
    useChartVersionResultsMutation,
    useQueryResults,
} from '../../hooks/useQueryResults';

export enum ExplorerSection {
    FILTERS = 'FILTERS',
    VISUALIZATION = 'VISUALIZATION',
    CUSTOMVISUALIZATION = 'CUSTOMVISUALIZATION',
    RESULTS = 'RESULTS',
    SQL = 'SQL',
}

export enum ActionType {
    RESET,
    SET_TABLE_NAME,
    REMOVE_FIELD,
    TOGGLE_DIMENSION,
    TOGGLE_METRIC,
    TOGGLE_SORT_FIELD,
    SET_SORT_FIELDS,
    ADD_SORT_FIELD,
    REMOVE_SORT_FIELD,
    MOVE_SORT_FIELDS,
    SET_ROW_LIMIT,
    SET_FILTERS,
    SET_COLUMN_ORDER,
    ADD_TABLE_CALCULATION,
    UPDATE_TABLE_CALCULATION,
    DELETE_TABLE_CALCULATION,
    SET_FETCH_RESULTS_FALSE,
    SET_PREVIOUSLY_FETCHED_STATE,
    ADD_ADDITIONAL_METRIC,
    EDIT_ADDITIONAL_METRIC,
    REMOVE_ADDITIONAL_METRIC,
    TOGGLE_ADDITIONAL_METRIC_MODAL,
    SET_PIVOT_FIELDS,
    SET_CHART_TYPE,
    SET_CHART_CONFIG,
    TOGGLE_EXPANDED_SECTION,
    ADD_CUSTOM_DIMENSION,
    EDIT_CUSTOM_DIMENSION,
    REMOVE_CUSTOM_DIMENSION,
    TOGGLE_CUSTOM_DIMENSION_MODAL,
}

export type ConfigCacheMap = {
    [ChartType.PIE]: PieChartConfig['config'];
    [ChartType.BIG_NUMBER]: BigNumberConfig['config'];
    [ChartType.TABLE]: TableChartConfig['config'];
    [ChartType.CARTESIAN]: CartesianChartConfig['config'];
    [ChartType.CUSTOM]: CustomVisConfig['config'];
};

interface SwapSortFieldsPayload {
    sourceIndex: number;
    destinationIndex: number;
}

export type Action =
    | { type: ActionType.RESET; payload: ExplorerReduceState }
    | { type: ActionType.SET_FETCH_RESULTS_FALSE }
    | {
          type: ActionType.SET_PREVIOUSLY_FETCHED_STATE;
          payload: MetricQuery;
      }
    | { type: ActionType.SET_TABLE_NAME; payload: string }
    | { type: ActionType.TOGGLE_EXPANDED_SECTION; payload: ExplorerSection }
    | {
          type:
              | ActionType.REMOVE_FIELD
              | ActionType.TOGGLE_DIMENSION
              | ActionType.TOGGLE_METRIC
              | ActionType.TOGGLE_SORT_FIELD;
          payload: FieldId;
      }
    | {
          type: ActionType.SET_SORT_FIELDS;
          payload: SortField[];
      }
    | {
          type: ActionType.ADD_SORT_FIELD;
          payload: SortField;
      }
    | {
          type: ActionType.REMOVE_SORT_FIELD;
          payload: FieldId;
      }
    | {
          type: ActionType.MOVE_SORT_FIELDS;
          payload: SwapSortFieldsPayload;
      }
    | {
          type: ActionType.SET_ROW_LIMIT;
          payload: number;
      }
    | {
          type: ActionType.SET_FILTERS;
          payload: MetricQuery['filters'];
      }
    | {
          type: ActionType.ADD_TABLE_CALCULATION;
          payload: TableCalculation;
      }
    | {
          type: ActionType.UPDATE_TABLE_CALCULATION;
          payload: { oldName: string; tableCalculation: TableCalculation };
      }
    | {
          type: ActionType.DELETE_TABLE_CALCULATION;
          payload: string;
      }
    | {
          type: ActionType.SET_COLUMN_ORDER;
          payload: string[];
      }
    | {
          type: ActionType.ADD_ADDITIONAL_METRIC;
          payload: AdditionalMetric;
      }
    | {
          type: ActionType.EDIT_ADDITIONAL_METRIC;
          payload: {
              additionalMetric: AdditionalMetric;
              previousAdditionalMetricName: string;
          };
      }
    | {
          type: ActionType.REMOVE_ADDITIONAL_METRIC;
          payload: FieldId;
      }
    | {
          type: ActionType.TOGGLE_ADDITIONAL_METRIC_MODAL;
          payload?: Omit<
              ExplorerReduceState['modals']['additionalMetric'],
              'isOpen'
          >;
      }
    | {
          type: ActionType.SET_PIVOT_FIELDS;
          payload: FieldId[];
      }
    | {
          type: ActionType.SET_CHART_TYPE;
          payload: {
              chartType: ChartType;
              cachedConfigs: Partial<ConfigCacheMap>;
          };
      }
    | {
          type: ActionType.SET_CHART_CONFIG;
          payload: {
              chartConfig: ChartConfig;
              cachedConfigs: Partial<ConfigCacheMap>;
          };
      }
    | {
          type: ActionType.ADD_CUSTOM_DIMENSION;
          payload: CustomDimension;
      }
    | {
          type: ActionType.EDIT_CUSTOM_DIMENSION;
          payload: {
              customDimension: CustomDimension;
              previousCustomDimensionName: string;
          };
      }
    | {
          type: ActionType.REMOVE_CUSTOM_DIMENSION;
          payload: FieldId;
      }
    | {
          type: ActionType.TOGGLE_CUSTOM_DIMENSION_MODAL;
          payload?: Omit<
              ExplorerReduceState['modals']['customDimension'],
              'isOpen'
          >;
      };

export interface ExplorerReduceState {
    shouldFetchResults: boolean;
    expandedSections: ExplorerSection[];
    unsavedChartVersion: CreateSavedChartVersion;
    previouslyFetchedState?: MetricQuery;
    modals: {
        additionalMetric: {
            isOpen: boolean;
            isEditing?: boolean;
            item?: Dimension | AdditionalMetric;
            type?: MetricType;
        };
        customDimension: {
            isOpen: boolean;
            isEditing?: boolean;
            item?: Dimension | CustomDimension;
        };
    };
}

export interface ExplorerState extends ExplorerReduceState {
    activeFields: Set<FieldId>;
    isValidQuery: boolean;
    hasUnsavedChanges: boolean;
    isEditMode: boolean;
    savedChart: SavedChart | undefined;
}

export interface ExplorerContext {
    state: ExplorerState;
    queryResults: ReturnType<
        typeof useQueryResults | typeof useChartVersionResultsMutation
    >;
    actions: {
        clearExplore: () => void;
        clearQuery: () => void;
        reset: () => void;
        setTableName: (tableName: string) => void;
        removeActiveField: (fieldId: FieldId) => void;
        toggleActiveField: (fieldId: FieldId, isDimension: boolean) => void;
        toggleSortField: (fieldId: FieldId) => void;
        setSortFields: (sortFields: SortField[]) => void;
        addSortField: (
            fieldId: FieldId,
            options?: { descending: boolean },
        ) => void;
        removeSortField: (fieldId: FieldId) => void;
        moveSortFields: (sourceIndex: number, destinationIndex: number) => void;
        setRowLimit: (limit: number) => void;
        setFilters: (
            filters: MetricQuery['filters'],
            syncPristineState: boolean,
        ) => void;
        addAdditionalMetric: (metric: AdditionalMetric) => void;
        editAdditionalMetric: (
            metric: AdditionalMetric,
            previousMetricName: string,
        ) => void;
        removeAdditionalMetric: (key: FieldId) => void;
        toggleAdditionalMetricModal: (
            additionalMetricModalData?: Omit<
                ExplorerReduceState['modals']['additionalMetric'],
                'isOpen'
            >,
        ) => void;
        setColumnOrder: (order: string[]) => void;
        addTableCalculation: (tableCalculation: TableCalculation) => void;
        updateTableCalculation: (
            oldName: string,
            tableCalculation: TableCalculation,
        ) => void;
        deleteTableCalculation: (name: string) => void;
        setPivotFields: (fields: FieldId[] | undefined) => void;
        setChartType: (chartType: ChartType) => void;
        setChartConfig: (chartConfig: ChartConfig) => void;
        fetchResults: () => void;
        toggleExpandedSection: (section: ExplorerSection) => void;
        addCustomDimension: (customDimension: CustomDimension) => void;
        editCustomDimension: (
            customDimension: CustomDimension,
            previousCustomDimensionName: string,
        ) => void;
        removeCustomDimension: (key: FieldId) => void;
        toggleCustomDimensionModal: (
            additionalMetricModalData?: Omit<
                ExplorerReduceState['modals']['customDimension'],
                'isOpen'
            >,
        ) => void;
    };
}
