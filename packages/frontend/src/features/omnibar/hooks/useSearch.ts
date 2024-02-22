import { ApiError, SearchFilters, SearchResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getSearchResults } from '../api/search';

export const OMNIBAR_MIN_QUERY_LENGTH = 3;

const useSearch = (
    projectUuid: string,
    query: string = '',
    filters?: SearchFilters,
) => {
    return useQuery<SearchResults, ApiError>({
        queryKey: ['search', query],
        queryFn: () => getSearchResults({ projectUuid, query, filters }),
        retry: false,
        enabled: query.length >= OMNIBAR_MIN_QUERY_LENGTH,
    });
};

export default useSearch;
