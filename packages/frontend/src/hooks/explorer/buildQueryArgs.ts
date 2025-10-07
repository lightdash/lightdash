import {
    derivePivotConfigurationFromChart,
    getFieldsFromMetricQuery,
    type DateGranularity,
    type Explore,
    type FieldId,
    type MetricQuery,
    type ParametersValuesMap,
    type SavedChartDAO,
} from '@lightdash/common';
import type { QueryResultsProps } from '../useQueryResults';

/**
 * Builds query arguments for execution
 *
 * This is shared logic between useExplorerQueryManager (automatic queries)
 * and useExplorerQuery (manual queries like fetchResults)
 */
export function buildQueryArgs(options: {
    activeFields: Set<FieldId>;
    tableName: string | undefined;
    projectUuid: string | undefined;
    explore: Explore | undefined;
    useSqlPivotResults: boolean;
    computedMetricQuery: MetricQuery;
    parameters: ParametersValuesMap | undefined;
    isEditMode: boolean;
    viewModeQueryArgs?:
        | { chartUuid: string; context?: string }
        | { chartUuid: string; chartVersionUuid: string };
    dateZoomGranularity?: DateGranularity;
    minimal: boolean;
    savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>;
}): QueryResultsProps | null {
    const {
        activeFields,
        tableName,
        projectUuid,
        explore,
        useSqlPivotResults,
        computedMetricQuery,
        parameters,
        isEditMode,
        viewModeQueryArgs,
        dateZoomGranularity,
        minimal,
    } = options;

    const hasFields = activeFields.size > 0;

    if (!tableName || !hasFields || !projectUuid || !explore) {
        return null;
    }

    let pivotConfiguration = undefined;

    if (useSqlPivotResults) {
        const items = getFieldsFromMetricQuery(computedMetricQuery, explore);
        pivotConfiguration = derivePivotConfigurationFromChart(
            options.savedChart,
            computedMetricQuery,
            items,
        );
    }
    return {
        projectUuid,
        tableId: tableName,
        query: computedMetricQuery,
        ...(isEditMode ? {} : viewModeQueryArgs),
        dateZoomGranularity,
        invalidateCache: minimal,
        parameters: parameters || {},
        pivotConfiguration,
    };
}
