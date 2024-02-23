import { SearchFilters, SearchResults } from '@lightdash/common';
import _ from 'lodash';
import { lightdashApi } from '../../../api';

export const getSearchResults = async ({
    projectUuid,
    query,
    filters,
}: {
    projectUuid: string;
    query: string;
    filters?: SearchFilters;
}) => {
    const sanitizedFilters = _.omitBy(filters, _.isNil);
    const searchParams = filters
        ? new URLSearchParams(filters).toString()
        : undefined;

    return lightdashApi<SearchResults>({
        url: `/projects/${projectUuid}/search/${encodeURIComponent(query)}${
            searchParams ? `?${searchParams}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};
