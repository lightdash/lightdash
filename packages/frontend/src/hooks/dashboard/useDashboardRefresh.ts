import {
    QueryHistoryStatus,
    type ApiGetAsyncQueryResults,
} from '@lightdash/common';
import {
    useIsFetching,
    useQueryClient,
    type Query,
    type QueryCache,
    type QueryClient,
    type QueryKey,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { type DashboardChartReadyQuery } from './useDashboardChartReadyQuery';

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

// Tiles with a request on the wire; one queued for a slot or waiting to retry
// sends its next request later
const sendingRequest = new WeakSet<Query>();

export const sendTileRequest = async <T>(
    queryClient: QueryClient,
    queryKey: QueryKey,
    request: Promise<T>,
) => {
    const query = queryClient.getQueryCache().find(queryKey);
    if (query) sendingRequest.add(query);
    try {
        return await request;
    } finally {
        if (query) sendingRequest.delete(query);
    }
};

// A model tile loads its rows by query uuid after its request returns
const isAwaitingRows = (queryCache: QueryCache, query: Query) => {
    if (query.queryKey[0] !== 'dashboard_chart_ready_query') return false;
    const data = query.state.data as DashboardChartReadyQuery | undefined;
    const queryUuid = data?.executeQueryResponse?.queryUuid;
    if (!queryUuid || query.state.fetchStatus !== 'idle') return false;
    return !queryCache.findAll(['query-page']).some((page) => {
        const [, args] = page.queryKey as [string, { queryUuid?: string }];
        const results = page.state.data as ApiGetAsyncQueryResults | undefined;
        return (
            args.queryUuid === queryUuid &&
            results?.status === QueryHistoryStatus.READY
        );
    });
};

// A save keeps on-screen results, so tiles don't reload; each is dropped once
// its tile unmounts, unless refetched since, so a later visit fetches fresh
export const evictSavedDashboardResults = (queryClient: QueryClient) => {
    const queryCache = queryClient.getQueryCache();
    queryClient.removeQueries({
        predicate: dashboardResultsQueryPredicate,
        type: 'inactive',
    });
    // Whether each on-screen result has a request sent since the save; one
    // fetching with no request on the wire sends it later
    const onScreen = new Map(
        queryCache
            .findAll({
                predicate: dashboardResultsQueryPredicate,
                type: 'active',
            })
            .map((query) => [
                query,
                query.state.fetchStatus !== 'idle' &&
                    !sendingRequest.has(query),
            ]),
    );
    if (onScreen.size === 0) return;
    // A request started before the save may answer with older data, so its
    // tile fetches once more when it lands
    const startedBeforeSave = new Set(
        [...onScreen.keys()].filter((query) => sendingRequest.has(query)),
    );
    // Rows still loading may also predate the save, so those tiles run again now
    const awaitingRows = [...onScreen.keys()].filter((query) =>
        isAwaitingRows(queryCache, query),
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
            const { type } = event.action;
            // A retry is a new request, sent after the save
            if (type === 'fetch' || type === 'failed') {
                startedBeforeSave.delete(query);
                onScreen.set(query, true);
            }
            if (type !== 'success' && type !== 'error') return;
            if (startedBeforeSave.delete(query)) {
                onScreen.set(query, false);
                // Not for a tile already gone; its error lands in the query state
                void Promise.resolve()
                    .then(() =>
                        query.getObserversCount() > 0
                            ? query.fetch()
                            : undefined,
                    )
                    .catch(() => {});
            } else if (type === 'success' && onScreen.get(query)) {
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
    awaitingRows.forEach((query) => {
        void query.fetch().catch(() => {});
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
