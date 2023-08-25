import { useQueries, useQueryClient } from 'react-query';

export const useDashboardRefresh = (dashboardUuid: string) => {
    const queryClient = useQueryClient();

    const queriesToRefresh = [
        { queryKey: ['queryResults'] },
        { queryKey: ['saved_query'] },
        { queryKey: ['saved_dashboard_query', dashboardUuid] },
        { queryKey: ['dashboards', 'availableFilters'] },
    ];

    const queries = useQueries(queriesToRefresh);

    const isOneAtLeastFetching = queries.some((query) => query.isFetching);

    const invalidateDashboardRelatedQueries = () => {
        queriesToRefresh.forEach((query) => {
            queryClient.invalidateQueries(query.queryKey);
        });
    };

    return { invalidateDashboardRelatedQueries, isOneAtLeastFetching };
};
