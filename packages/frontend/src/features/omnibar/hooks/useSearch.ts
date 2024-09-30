import {
    type ApiError,
    type SearchFilters,
    type SearchResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getSearchResults } from '../api/search';
import { type SearchResultMap } from '../types/searchResultMap';
import { getSearchItemMap } from '../utils/getSearchItemMap';

export const OMNIBAR_MIN_QUERY_LENGTH = 3;

const useSearch = (
    projectUuid: string,
    query: string = '',
    filters?: SearchFilters,
) =>
    useQuery<SearchResults, ApiError, SearchResultMap>({
        queryKey: ['search', filters ?? 'all', query],
        queryFn: () => getSearchResults({ projectUuid, query, filters }),
        retry: false,
        enabled: query.length >= OMNIBAR_MIN_QUERY_LENGTH,
        select: (data) => getSearchItemMap(data, projectUuid),
    });

export default useSearch;
