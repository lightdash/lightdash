import {
    type DashboardFilters,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';

/**
 * What a chart editor derives its config from: results, fields, colours and
 * the query being edited. Owned by react-query and the provider's props, so
 * not stored; selectors take it as their second argument.
 */
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
};
