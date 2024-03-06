import { ApiError, ApiExploreResults, CustomExplore } from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getExplore = async (projectUuid: string, exploreId: string) =>
    lightdashApi<ApiExploreResults>({
        url: `/projects/${projectUuid}/explores/${exploreId}`,
        method: 'GET',
        body: undefined,
    });

export const useExplore = ({
    exploreName,
    customExplore,
    useQueryOptions,
}: {
    exploreName: string | undefined;
    customExplore?: CustomExplore;
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();

    return useQuery<ApiExploreResults, ApiError>({
        // TODO: fix queryKey
        queryKey: [
            projectUuid,
            'explore',
            customExplore ? customExplore.sql : exploreName,
        ],
        queryFn: () =>
            customExplore
                ? Promise.resolve(customExplore.explore)
                : getExplore(projectUuid, exploreName!),
        enabled: !!exploreName || !!customExplore,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};
