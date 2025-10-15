import {
    type ApiError,
    type SearchFilters,
    type SearchResults,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getSearchResults } from '../api/search';
import { type SearchResultMap } from '../types/searchResultMap';
import { getSearchItemMap } from '../utils/getSearchItemMap';

export const OMNIBAR_MIN_QUERY_LENGTH = 3;

type Params = UseQueryOptions<SearchResults, ApiError, SearchResultMap> & {
    projectUuid: string;
    query?: string;
    filters?: SearchFilters;
    source: 'omnibar' | 'ai_search_box';
};

const useSearch = ({
    projectUuid,
    query = '',
    filters,
    source,
    ...params
}: Params) =>
    useQuery<SearchResults, ApiError, SearchResultMap>({
        queryKey: [projectUuid, 'search', filters ?? 'all', query],
        queryFn: () =>
            getSearchResults({ projectUuid, query, filters, source }),
        retry: false,
        enabled: query.length >= OMNIBAR_MIN_QUERY_LENGTH,
        select: (data) => getSearchItemMap(data, projectUuid),
        ...params,
    });

export default useSearch;
