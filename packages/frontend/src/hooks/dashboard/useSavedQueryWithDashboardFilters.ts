import { DashboardFilters, FilterGroup, SavedChart } from '@lightdash/common';
import { useExplore } from '../useExplore';
import { useSavedQuery } from '../useSavedQuery';
import useDashboardFiltersForExplore from './useDashboardFiltersForExplore';

const useSavedQueryWithDashboardFilters = (
    tileUuid: string,
    savedChartUuid: string | null,
): {
    isLoading: boolean;
    data: SavedChart | undefined;
    dashboardFilters: DashboardFilters | undefined;
} => {
    const { data: savedQuery, isLoading } = useSavedQuery({
        id: savedChartUuid || undefined,
        useQueryOptions: { refetchOnMount: false },
    });

    const { data: explore, isLoading: isLoadingExplore } = useExplore(
        savedQuery?.tableName,
    );

    const dashboardFilters = useDashboardFiltersForExplore(tileUuid, explore);

    if (savedChartUuid === null) {
        return { isLoading: false, data: undefined, dashboardFilters };
    }

    if (isLoading || isLoadingExplore || !savedQuery || !explore) {
        return {
            isLoading: true,
            data: undefined,
            dashboardFilters: undefined,
        };
    }

    const dimensionFilters: FilterGroup = {
        id: 'yes',
        and: [
            ...(savedQuery.metricQuery.filters.dimensions
                ? [savedQuery.metricQuery.filters.dimensions]
                : []),
            ...dashboardFilters.dimensions,
        ],
    };
    const metricFilters: FilterGroup = {
        id: 'no',
        and: [
            ...(savedQuery.metricQuery.filters.metrics
                ? [savedQuery.metricQuery.filters.metrics]
                : []),
            ...dashboardFilters.metrics,
        ],
    };
    const savedQueryWithDashboardFilters = {
        ...savedQuery,
        metricQuery: {
            ...savedQuery.metricQuery,
            filters: {
                dimensions: dimensionFilters,
                metrics: metricFilters,
            },
        },
    };

    return {
        isLoading: false,
        data: savedQueryWithDashboardFilters,
        dashboardFilters,
    };
};

export default useSavedQueryWithDashboardFilters;
