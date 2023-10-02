import {
    addDashboardFiltersToMetricQuery,
    DashboardFilters,
    SavedChart,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useExplore } from '../useExplore';
import { useSavedQuery } from '../useSavedQuery';
import useDashboardFiltersForExplore from './useDashboardFiltersForExplore';

const useSavedQueryWithDashboardFilters = (
    tileUuid: string,
    savedChartUuid: string | null,
): {
    isLoading: boolean;
    isError: boolean;
    data: SavedChart | undefined;
    dashboardFilters: DashboardFilters | undefined;
} => {
    const {
        data: savedQuery,
        isLoading: isLoadingSavedQuery,
        isFetching: isFetchingSavedQuery,
        isError,
    } = useSavedQuery({
        id: savedChartUuid || undefined,
        useQueryOptions: { refetchOnMount: false },
    });

    const { data: explore, isLoading: isLoadingExplore } = useExplore(
        savedQuery?.tableName,
    );

    const isLoadingOrFetching =
        isLoadingSavedQuery ||
        isFetchingSavedQuery ||
        isLoadingExplore ||
        !savedQuery ||
        !explore;

    const dashboardFilters = useDashboardFiltersForExplore(tileUuid, explore);

    const savedQueryWithDashboardFilters = useMemo(() => {
        if (isLoadingOrFetching) return undefined;

        return {
            ...savedQuery,
            metricQuery: addDashboardFiltersToMetricQuery(
                savedQuery.metricQuery,
                dashboardFilters,
            ),
        };
    }, [isLoadingOrFetching, savedQuery, dashboardFilters]);

    return useMemo(() => {
        if (isError) {
            return {
                isLoading: false,
                isError: true,
                data: undefined,
                dashboardFilters: undefined,
            };
        }

        if (isLoadingOrFetching) {
            return {
                isLoading: true,
                isError: false,
                data: undefined,
                dashboardFilters: undefined,
            };
        }

        return {
            isLoading: false,
            isError: false,
            data: savedQueryWithDashboardFilters,
            dashboardFilters,
        };
    }, [
        isError,
        isLoadingOrFetching,
        savedQueryWithDashboardFilters,
        dashboardFilters,
    ]);
};

export default useSavedQueryWithDashboardFilters;
