import { UseQueryOptions } from 'react-query';

export type UseQueryFetchOptions = Pick<
    UseQueryOptions,
    | 'cacheTime'
    | 'staleTime'
    | 'refetchOnWindowFocus'
    | 'refetchOnMount'
    | 'refetchOnReconnect'
>;
