import { useIsFetching, useQueryClient } from 'react-query';

export const useDashboardRefresh = () => {
    const queryClient = useQueryClient();

    const queryKeysToRefresh = [
        'savedChartResults',
        'saved_query',
        'saved_dashboard_query',
        'dashboards',
    ];

    const isFetching = useIsFetching();

    const invalidateDashboardRelatedQueries = () => {
        queryKeysToRefresh.map((key) => {
            return queryClient.invalidateQueries({
                queryKey: [key],
            });
        });
    };

    return {
        invalidateDashboardRelatedQueries,
        isFetching,
    };
};
