import {
    type ApiErrorDetail,
    type DashboardFilters,
    type DateZoom,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';

/** What an editor derives its config from; not stored, so selectors take it as their second argument */
export type VisualizationInputs = {
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
          })
        | undefined;
    itemsMap: ItemsMap | undefined;
    colorPalette: string[];
    columnOrder: string[];
    pivotDimensions: string[] | undefined;
    initialPivotRows: string[] | undefined;
    parameters: ParametersValuesMap | undefined;
    unsavedMetricQuery: MetricQuery | undefined;
    tableCalculationsMetadata: TableCalculationMetadata[] | undefined;
    dashboardFilters: DashboardFilters | undefined;
    invalidateCache: boolean | undefined;
    isLoading: boolean;
    minimal: boolean;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    savedChartUuid?: string;
    apiErrorDetail?: ApiErrorDetail | null;
    isDashboard?: boolean;
    isEditMode?: boolean;
    hasExplorerStore: boolean;
    // Resolved timezone for formatting (undefined when EnableTimezoneSupport flag is off)
    resolvedTimezone?: string;
    // Date-zoom granularity applied by the surface (dashboards); undefined elsewhere.
    dateZoom?: DateZoom;
};
