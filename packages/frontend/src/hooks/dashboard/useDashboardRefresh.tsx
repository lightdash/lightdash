import { useCallback, useMemo } from 'react';
import { Query, useIsFetching, useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';

const QUERIES_TO_REFRESH = [
    'savedChartResults',
    'saved_query',
    'saved_dashboard_query',
    'dashboards',
];

const queryPredicate = (query: Query) => {
    return QUERIES_TO_REFRESH.some((key) => {
        const firstQueryKey =
            typeof query.queryKey === 'string'
                ? query.queryKey
                : query.queryKey[0];
        return firstQueryKey === key;
    });
};

const clearCache = async () => {
    return lightdashApi<undefined>({
        url: '/chartCache/clear',
        method: 'POST',
        body: undefined,
    });
};

export const useDashboardRefresh = () => {
    const queryClient = useQueryClient();

    const { mutateAsync } = useMutation(clearCache);

    const isFetching = useIsFetching({ predicate: queryPredicate });

    const invalidateDashboardRelatedQueries = useCallback(async () => {
        await mutateAsync();
        return queryClient.invalidateQueries({
            predicate: queryPredicate,
        });
    }, [queryClient, mutateAsync]);

    return useMemo(
        () => ({
            invalidateDashboardRelatedQueries,
            isFetching,
        }),
        [invalidateDashboardRelatedQueries, isFetching],
    );
};
