import { ApiError, SearchResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getSearchResults } from '../api/search';

export const OMNIBAR_MIN_QUERY_LENGTH = 3;

const useSearch = (projectUuid: string, query: string = '') => {
    return useQuery<SearchResults, ApiError>({
        queryKey: ['search', query],
        queryFn: () =>
            getSearchResults({
                projectUuid,
                query,
            }),
        retry: false,
        enabled: query.length >= OMNIBAR_MIN_QUERY_LENGTH,
        keepPreviousData: true,
    });
};

export default useSearch;
