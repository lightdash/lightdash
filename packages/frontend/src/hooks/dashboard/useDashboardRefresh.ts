import {
    useIsFetching,
    useQueryClient,
    type Query,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const DASHBOARD_RELATED_QUERIES = [
    'saved_query',
    'saved_dashboard_query',
    'dashboards',
];

const DASHBOARD_RESULTS_QUERIES = [
    'dashboard_chart_ready_query',
    'savedSqlChartResults',
];

const getPredicateFunction = (keyArray: string[]) => {
    return (query: Query) => {
        return keyArray.some((key) => {
            const firstQueryKey =
                typeof query.queryKey === 'string'
                    ? query.queryKey
                    : query.queryKey?.[0];
            return firstQueryKey === key;
        });
    };
};

const dashboardRelatedQueryPredicate = getPredicateFunction(
    DASHBOARD_RELATED_QUERIES,
);

const dashboardResultsQueryPredicate = getPredicateFunction(
    DASHBOARD_RESULTS_QUERIES,
);

export const useDashboardRefresh = () => {
    const queryClient = useQueryClient();

    const isFetchingDashboardRelatedQueries = useIsFetching({
        predicate: dashboardRelatedQueryPredicate,
    });

    const isFetchingDashboardResultsQueries = useIsFetching({
        predicate: dashboardResultsQueryPredicate,
    });

    const invalidateDashboardRelatedQueries = useCallback(() => {
        return queryClient.invalidateQueries({
            predicate: dashboardRelatedQueryPredicate,
        });
    }, [queryClient]);

    const invalidateDashboardResultsQueries = useCallback(() => {
        return queryClient.invalidateQueries({
            predicate: dashboardResultsQueryPredicate,
        });
    }, [queryClient]);

    return useMemo(
        () => ({
            invalidateDashboardRelatedQueries,
            invalidateDashboardResultsQueries,
            isFetching:
                isFetchingDashboardRelatedQueries +
                isFetchingDashboardResultsQueries,
        }),
        [
            invalidateDashboardRelatedQueries,
            invalidateDashboardResultsQueries,
            isFetchingDashboardRelatedQueries,
            isFetchingDashboardResultsQueries,
        ],
    );
};
