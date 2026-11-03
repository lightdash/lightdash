import { type SearchFilters, type SearchResults } from '@lightdash/common';
import { isNil, omitBy } from 'es-toolkit';
import { type LightdashApi } from '../../../api';

export const getSearchResults = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        query,
        filters,
        source,
    }: {
        projectUuid: string;
        query: string;
        source: 'omnibar' | 'ai_search_box';
        filters?: SearchFilters;
    },
) => {
    const sanitisedFilters = filters ? omitBy(filters, isNil) : {};
    const params = new URLSearchParams({
        ...Object.fromEntries(
            Object.entries(sanitisedFilters).map(([key, value]) => [
                key,
                String(value),
            ]),
        ),
        source,
    });

    return lightdashApi<SearchResults>({
        url: `/projects/${projectUuid}/search/${encodeURIComponent(
            query,
        )}?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};
