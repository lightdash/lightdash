import { ApiError, SearchResults } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

export const getSearchResults = async ({
    projectUuid,
    query,
}: {
    projectUuid: string;
    query: string;
}) =>
    lightdashApi<SearchResults>({
        url: `/projects/${projectUuid}/search/${query}`,
        method: 'GET',
        body: undefined,
    });

const useGlobalSearch = (projectUuid: string, query: string = '') => {
    return useQuery<SearchResults, ApiError>({
        queryKey: ['global-search', query],
        queryFn: () =>
            getSearchResults({
                projectUuid,
                query,
            }),
        retry: false,
        enabled: query.length > 2,
        keepPreviousData: true,
    });
};

export default useGlobalSearch;
