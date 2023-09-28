import {
    addDashboardFiltersToMetricQuery,
    DashboardFilters,
    SavedChart,
} from '@lightdash/common';
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

    const savedQueryWithDashboardFilters = {
        ...savedQuery,
        metricQuery: addDashboardFiltersToMetricQuery(
            savedQuery.metricQuery,
            dashboardFilters,
        ),
    };

    return {
        isLoading,
        isError,
        data: savedQueryWithDashboardFilters,
        dashboardFilters,
    };
};

export default useSavedQueryWithDashboardFilters;
