import {
    type ApiError,
    type SearchFilters,
    type SearchResults,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getSearchResults } from '../api/search';
import { type SearchResultMap } from '../types/searchResultMap';
import { getSearchItemMap } from '../utils/getSearchItemMap';

const OMNIBAR_MIN_QUERY_LENGTH = 3;
const OMNIBAR_MIN_QUERY_LENGTH_CJK = 1;

// Detect CJK input: Han characters, Japanese kana, and Korean Hangul.
const CJK_CHARACTER_REGEX =
    /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}]/u;

export const hasMinQueryLength = (query: string | undefined): boolean => {
    const trimmedQuery = query?.trim();

    if (!trimmedQuery) {
        return false;
    }

    const minLength = CJK_CHARACTER_REGEX.test(trimmedQuery)
        ? OMNIBAR_MIN_QUERY_LENGTH_CJK
        : OMNIBAR_MIN_QUERY_LENGTH;

    return trimmedQuery.length >= minLength;
};

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
        enabled: hasMinQueryLength(query),
        select: (data) => getSearchItemMap(data, projectUuid),
        ...params,
    });

export default useSearch;
