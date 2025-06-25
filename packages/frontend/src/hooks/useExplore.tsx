import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getExplore = async (projectUuid: string, exploreId: string) =>
    lightdashApi<ApiExploreResults>({
        url: `/projects/${projectUuid}/explores/${exploreId}`,
        method: 'GET',
        body: undefined,
    });

export const useExplore = (
    activeTableName: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
    projectUuid?: string,
) => {
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const setErrorResponse = useQueryError();

    // Use provided projectUuid or fall back to URL params
    const finalProjectUuid = projectUuid || projectUuidFromParams;

    const queryKey = ['tables', activeTableName, finalProjectUuid];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () => getExplore(finalProjectUuid!, activeTableName || ''),
        enabled: !!activeTableName && !!finalProjectUuid,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};
