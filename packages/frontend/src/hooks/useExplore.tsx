import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import useEmbed from '../ee/providers/Embed/useEmbed';
import useQueryError from './useQueryError';

const getExplore = async (
    projectUuid: string,
    exploreId: string,
    options: { headers?: Record<string, string> } = {},
) => {
    try {
        const t = await lightdashApi<ApiExploreResults>({
            url: `/projects/${projectUuid}/explores/${exploreId}`,
            method: 'GET',
            headers: options.headers,
        });
        console.log('t', t);
        return t;
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const useExplore = (
    activeTableName: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
) => {
    const { projectUuid: embedProjectUuid, embedHeaders } = useEmbed();
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const setErrorResponse = useQueryError();

    const projectUuid = projectUuidFromParams || embedProjectUuid;

    const queryKey = ['tables', activeTableName, projectUuid];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () =>
            getExplore(projectUuid!, activeTableName || '', {
                headers: embedHeaders,
            }),
        enabled: !!activeTableName && !!projectUuid,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};
