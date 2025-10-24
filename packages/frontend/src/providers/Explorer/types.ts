import {
    type AdditionalMetric,
    type BigNumberConfig,
    type CartesianChartConfig,
    type ChartConfig,
    type ChartType,
    type CreateSavedChartVersion,
    type CustomDimension,
    type CustomFormat,
    type CustomVisConfig,
    type Dimension,
    type FieldId,
    type FunnelChartConfig,
    type Item,
    type Metric,
    type MetricQuery,
    type MetricType,
    type ParameterDefinitions,
    type PieChartConfig,
    type ReplaceCustomFields,
    type SavedChart,
    type TableCalculation,
    type TableCalculationMetadata,
    type TableChartConfig,
    type TimeZone,
    type TreemapChartConfig,
} from '@lightdash/common';
import { type QueryResultsProps } from '../../hooks/useQueryResults';

export enum ExplorerSection {
    FILTERS = 'FILTERS',
    VISUALIZATION = 'VISUALIZATION',
    CUSTOMVISUALIZATION = 'CUSTOMVISUALIZATION',
    RESULTS = 'RESULTS',
    SQL = 'SQL',
    PARAMETERS = 'PARAMETERS',
}

export enum ActionType {
    RESET,
    SET_TABLE_NAME,
    SET_FILTERS,
    SET_ROW_LIMIT,
    SET_TIME_ZONE,
    SET_COLUMN_ORDER,
    ADD_TABLE_CALCULATION,
    UPDATE_TABLE_CALCULATION,
    DELETE_TABLE_CALCULATION,
    SET_PREVIOUSLY_FETCHED_STATE,
    ADD_ADDITIONAL_METRIC,
    EDIT_ADDITIONAL_METRIC,
    REMOVE_ADDITIONAL_METRIC,
    TOGGLE_ADDITIONAL_METRIC_MODAL,
    TOGGLE_WRITE_BACK_MODAL,
    SET_PIVOT_FIELDS,
    SET_CHART_TYPE,
    SET_CHART_CONFIG,
    TOGGLE_EXPANDED_SECTION,
    ADD_CUSTOM_DIMENSION,
    EDIT_CUSTOM_DIMENSION,
    REMOVE_CUSTOM_DIMENSION,
    TOGGLE_CUSTOM_DIMENSION_MODAL,
    TOGGLE_FORMAT_MODAL,
    UPDATE_METRIC_FORMAT,
    REPLACE_FIELDS,
    SET_PARAMETER_REFERENCES,
}

export type ConfigCacheMap = {
    [ChartType.PIE]: PieChartConfig['config'];
    [ChartType.FUNNEL]: FunnelChartConfig['config'];
    [ChartType.BIG_NUMBER]: BigNumberConfig['config'];
    [ChartType.TABLE]: TableChartConfig['config'];
    [ChartType.CARTESIAN]: CartesianChartConfig['config'];
    [ChartType.TREEMAP]: TreemapChartConfig['config'];
    [ChartType.CUSTOM]: CustomVisConfig['config'];
};

export type Action =
    | { type: ActionType.RESET; payload: ExplorerReduceState }
    | {
          type: ActionType.SET_PREVIOUSLY_FETCHED_STATE;
          payload: MetricQuery;
      }
    | { type: ActionType.SET_TABLE_NAME; payload: string }
    | { type: ActionType.SET_FILTERS; payload: MetricQuery['filters'] }
    | { type: ActionType.TOGGLE_EXPANDED_SECTION; payload: ExplorerSection }
    | {
          type: ActionType.SET_ROW_LIMIT;
          payload: number;
      }
    | {
          type: ActionType.SET_TIME_ZONE;
          payload: TimeZone;
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
          type: ActionType.TOGGLE_WRITE_BACK_MODAL;
          payload?: Omit<ExplorerReduceState['modals']['writeBack'], 'isOpen'>;
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
              previousCustomDimensionId: string;
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
      }
    | {
          type: ActionType.TOGGLE_FORMAT_MODAL;
          payload?: { metric: Metric };
      }
    | {
          type: ActionType.UPDATE_METRIC_FORMAT;
          payload: { metric: Metric; formatOptions: CustomFormat | undefined };
      }
    | {
          type: ActionType.REPLACE_FIELDS;
          payload: {
              fieldsToReplace: ReplaceCustomFields[string];
          };
      }
    | {
          type: ActionType.SET_PARAMETER_REFERENCES;
          payload: string[] | null;
      };

export interface ExplorerReduceState {
    expandedSections: ExplorerSection[];
    metadata?: {
        // Temporary state that tracks changes to `table calculations` - keeps track of new name and previous name to ensure these get updated correctly when making changes to the layout & config of a chart
        tableCalculations?: TableCalculationMetadata[];
    };
    isVisualizationConfigOpen?: boolean;
    isMinimal?: boolean;
    isEditMode?: boolean;
    unsavedChartVersion: CreateSavedChartVersion;
    previouslyFetchedState?: MetricQuery;
    /**
     * The parameters that are referenced in the query.
     * If null, this means we can't calculate the missing parameters, so we can't run the query.
     * If empty array, this means we know the missing parameters, but they are all optional, so we can run the query.
     */
    parameterReferences: string[] | null;
    parameterDefinitions: ParameterDefinitions;
    modals: {
        format: {
            isOpen: boolean;
            metric?: Metric;
        };
        additionalMetric: {
            isOpen: boolean;
            isEditing?: boolean;
            item?: Dimension | AdditionalMetric | CustomDimension;
            type?: MetricType;
        };
        customDimension: {
            isOpen: boolean;
            isEditing?: boolean;
            table?: string;
            item?: Dimension | CustomDimension;
        };
        writeBack: {
            isOpen: boolean;
            items?: CustomDimension[] | AdditionalMetric[];
        };
        itemDetail: {
            isOpen: boolean;
            itemType?: 'field' | 'table' | 'group';
            label?: string;
            description?: string;
            fieldItem?: Item | AdditionalMetric;
        };
    };

    // Query execution state - manages TanStack Query arguments and history
    queryExecution: {
        validQueryArgs: QueryResultsProps | null;
        unpivotedQueryArgs: QueryResultsProps | null;
        queryUuidHistory: string[];
        unpivotedQueryUuidHistory: string[];
    };
    fromDashboard?: string;
}

export interface ExplorerState extends ExplorerReduceState {
    // activeFields removed - use selectActiveFields Redux selector instead
    // isValidQuery removed - use selectIsValidQuery Redux selector instead
    isEditMode: boolean;
    savedChart: SavedChart | undefined;
    // Merged version WITHOUT filters - use for most reads (stable when filters change)
    mergedUnsavedChartVersion: CreateSavedChartVersion;
}

export interface ExplorerContextType {
    state: ExplorerState;
    actions: {
        clearExplore: () => void;
        clearQuery: () => void;
        reset: () => void;
        setTableName: (tableName: string) => void;
        setRowLimit: (limit: number) => void;
        setTimeZone: (timezone: string | null) => void;
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
        addCustomDimension: (customDimension: CustomDimension) => void;
        editCustomDimension: (
            customDimension: CustomDimension,
            previousCustomDimensionId: string,
        ) => void;
        removeCustomDimension: (key: FieldId) => void;
        toggleCustomDimensionModal: (
            additionalMetricModalData?: Omit<
                ExplorerReduceState['modals']['customDimension'],
                'isOpen'
            >,
        ) => void;
        toggleWriteBackModal: (
            writeBackModalData?: Omit<
                ExplorerReduceState['modals']['writeBack'],
                'isOpen'
            >,
        ) => void;
        toggleFormatModal: (args?: { metric: Metric }) => void;
        updateMetricFormat: (args: {
            metric: Metric;
            formatOptions: CustomFormat | undefined;
        }) => void;
        replaceFields: (fieldsToReplace: ReplaceCustomFields[string]) => void;
        openVisualizationConfig: () => void;
        closeVisualizationConfig: () => void;
        isUnsavedChartChanged: (
            chartVersion: CreateSavedChartVersion,
        ) => boolean;
    };
}
