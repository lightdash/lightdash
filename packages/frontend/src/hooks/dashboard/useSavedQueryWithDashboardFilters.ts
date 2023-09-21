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
} & Pick<ReturnType<typeof useSavedQuery>, 'isError' | 'isLoading'> => {
    const {
        data: savedQuery,
        isLoading,
        isFetching,
        isError,
    } = useSavedQuery({
        id: savedChartUuid || undefined,
        useQueryOptions: { refetchOnMount: false },
    });

    const { data: explore, isLoading: isLoadingExplore } = useExplore(
        savedQuery?.tableName,
    );

    const dashboardFilters = useDashboardFiltersForExplore(tileUuid, explore);

    if (isError)
        return {
            data: undefined,
            dashboardFilters: undefined,
            isLoading,
            isError,
        };

    if (savedChartUuid === null) {
        return {
            data: undefined,
            dashboardFilters,
            isLoading: false,
            isError,
        };
    }

    if (
        isLoading ||
        isFetching ||
        isLoadingExplore ||
        !savedQuery ||
        !explore
    ) {
        return {
            data: undefined,
            dashboardFilters: undefined,
            isLoading: isLoading || isFetching,
            isError,
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
        isLoading,
        isError,
        data: savedQueryWithDashboardFilters,
        dashboardFilters,
    };
};

export default useSavedQueryWithDashboardFilters;
