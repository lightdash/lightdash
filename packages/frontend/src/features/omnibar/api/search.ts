import {
    type SearchFilters,
    type SearchResults,
    type SearchScope,
} from '@lightdash/common';
import isNil from 'lodash/isNil';
import omitBy from 'lodash/omitBy';
import { lightdashApi } from '../../../api';

export const getSearchResults = async ({
    projectUuid,
    query,
    filters,
    source,
    scope = 'all',
    signal,
}: {
    projectUuid: string;
    query: string;
    source: 'omnibar' | 'ai_search_box';
    filters?: SearchFilters;
    scope?: SearchScope;
    signal?: AbortSignal;
}) => {
    const sanitisedFilters = omitBy(filters, isNil);
    const params = new URLSearchParams({
        ...Object.fromEntries(
            Object.entries(sanitisedFilters).map(([key, value]) => [
                key,
                String(value),
            ]),
        ),
        source,
        ...(scope === 'all' ? {} : { scope }),
    });

    return lightdashApi<SearchResults>({
        url: `/projects/${projectUuid}/search/${encodeURIComponent(
            query,
        )}?${params.toString()}`,
        method: 'GET',
        body: undefined,
        signal,
    });
};
