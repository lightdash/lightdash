import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';

const getExplore = async (projectUuid: string, exploreId: string) => {
    try {
        return await lightdashApi<ApiExploreResults>({
            url: `/projects/${projectUuid}/explores/${exploreId}`,
            method: 'GET',
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const useExplore = (
    activeTableName: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
) => {
    const projectUuid = useProjectUuid();
    const setErrorResponse = useQueryError();

    const queryKey = ['tables', activeTableName, projectUuid];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () => getExplore(projectUuid!, activeTableName || ''),
        enabled: !!activeTableName && !!projectUuid,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};
