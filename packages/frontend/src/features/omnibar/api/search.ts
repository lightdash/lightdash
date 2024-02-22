import { SearchResults } from '@lightdash/common';
import { lightdashApi } from '../../../api';

export const getSearchResults = async ({
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
