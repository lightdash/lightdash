import {
    type AdditionalMetric,
    type AnyType,
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
    type GaugeChartConfig,
    type Item,
    type MapChartConfig,
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

export type ChartConfigCache<T = AnyType> = {
    chartConfig: T;
    pivotConfig?: { columns: string[] };
};

export type ConfigCacheMap = {
    [ChartType.PIE]: ChartConfigCache<PieChartConfig['config']>;
    [ChartType.FUNNEL]: ChartConfigCache<FunnelChartConfig['config']>;
    [ChartType.BIG_NUMBER]: ChartConfigCache<BigNumberConfig['config']>;
    [ChartType.TABLE]: ChartConfigCache<TableChartConfig['config']>;
    [ChartType.CARTESIAN]: ChartConfigCache<CartesianChartConfig['config']>;
    [ChartType.TREEMAP]: ChartConfigCache<TreemapChartConfig['config']>;
    [ChartType.GAUGE]: ChartConfigCache<GaugeChartConfig['config']>;
    [ChartType.MAP]: ChartConfigCache<MapChartConfig['config']>;
    [ChartType.CUSTOM]: ChartConfigCache<CustomVisConfig['config']>;
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

    cachedChartConfigs: Partial<ConfigCacheMap>;
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
        // Flag to trigger a query execution from components (works regardless of auto-fetch setting)
        pendingFetch: boolean;
        // Complete column order including PoP columns (derived from query results)
        // This is synced when query results arrive with popMetadata
        completeColumnOrder: string[];
    };
    fromDashboard?: string;
    isExploreFromHere?: boolean;
    savedChart?: SavedChart;
}
