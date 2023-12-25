import { ApiError, SearchResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 3;

const getSearchResults = async ({
    projectUuid,
    query,
}: {
    projectUuid: string;
    query: string;
}) =>
    lightdashApi<SearchResults>({
        url: `/projects/${projectUuid}/search/${encodeURIComponent(query)}`,
        method: 'GET',
        body: undefined,
    });

const useGlobalSearch = (projectUuid: string, query: string = '') => {
    return useQuery<SearchResults, ApiError>({
        queryKey: ['global-search', query],
        queryFn: () =>
            getSearchResults({
                projectUuid,
                query,
            }),
        retry: false,
        enabled: query.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH,
        keepPreviousData: true,
    });
};

export default useGlobalSearch;
