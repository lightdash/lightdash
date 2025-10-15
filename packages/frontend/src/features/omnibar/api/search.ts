import { type SearchFilters, type SearchResults } from '@lightdash/common';
import isNil from 'lodash/isNil';
import omitBy from 'lodash/omitBy';
import { lightdashApi } from '../../../api';

export const getSearchResults = async ({
    projectUuid,
    query,
    filters,
    source,
}: {
    projectUuid: string;
    query: string;
    source: 'omnibar' | 'ai_search_box';
    filters?: SearchFilters;
}) => {
    const sanitisedFilters = omitBy(filters, isNil);
    const params = new URLSearchParams({
        ...(sanitisedFilters || {}),
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
