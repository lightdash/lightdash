import {
    useIsFetching,
    useQueryClient,
    type Query,
    type QueryClient,
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

export const dashboardResultsQueryPredicate = getPredicateFunction(
    DASHBOARD_RESULTS_QUERIES,
);

// A save keeps on-screen results, so tiles don't reload; each is dropped once
// its tile unmounts, unless refetched since, so a later visit fetches fresh
export const evictSavedDashboardResults = (queryClient: QueryClient) => {
    const queryCache = queryClient.getQueryCache();
    queryClient.removeQueries({
        predicate: dashboardResultsQueryPredicate,
        type: 'inactive',
    });
    // Whether each on-screen result has a fetch started since the save
    const onScreen = new Map(
        queryCache
            .findAll({
                predicate: dashboardResultsQueryPredicate,
                type: 'active',
            })
            .map((query) => [query, false]),
    );
    if (onScreen.size === 0) return;
    // A request started before the save may answer with older data, so its
    // tile fetches once more when it lands
    const startedBeforeSave = new Set(
        [...onScreen.keys()].filter(
            (query) => query.state.fetchStatus === 'fetching',
        ),
    );
    const release = (query: Query) => {
        onScreen.delete(query);
        if (onScreen.size === 0) unsubscribe();
    };
    const unsubscribe = queryCache.subscribe((event) => {
        const { query } = event;
        if (!onScreen.has(query)) return;
        if (event.type === 'removed') {
            release(query);
        } else if (event.type === 'updated') {
            if (event.action.type === 'fetch') onScreen.set(query, true);
            if (event.action.type !== 'success') return;
            if (startedBeforeSave.delete(query)) {
                onScreen.set(query, false);
                void Promise.resolve().then(() => query.fetch());
            } else if (onScreen.get(query)) {
                release(query);
            }
        } else if (event.type === 'observerRemoved') {
            // Next tick, so a tile remounting in the same commit keeps it
            setTimeout(() => {
                if (!onScreen.has(query) || query.getObserversCount() > 0)
                    return;
                release(query);
                queryCache.remove(query);
            });
        }
    });
};

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

    const removeDashboardResultsQueries = useCallback(() => {
        queryClient.removeQueries({
            predicate: dashboardResultsQueryPredicate,
        });
    }, [queryClient]);

    return useMemo(
        () => ({
            invalidateDashboardRelatedQueries,
            removeDashboardResultsQueries,
            isFetching:
                isFetchingDashboardRelatedQueries +
                isFetchingDashboardResultsQueries,
        }),
        [
            invalidateDashboardRelatedQueries,
            removeDashboardResultsQueries,
            isFetchingDashboardRelatedQueries,
            isFetchingDashboardResultsQueries,
        ],
    );
};
