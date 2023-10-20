import { ApiError, ApiExploreResults } from '@lightdash/common';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import { useParams } from 'react-router-dom';
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
) => {
    const isStaleTimeFeatureEnabled = useFeatureFlagEnabled(
        'stale-time-on-use-explore',
    );
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const queryKey = ['tables', activeTableName, projectUuid];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () => getExplore(projectUuid, activeTableName || ''),
        enabled: !!activeTableName,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...(isStaleTimeFeatureEnabled && {
            staleTime: 1000 * 60 * 15,
            cacheTime: 1000 * 60 * 20,
        }),
        ...useQueryOptions,
    });
};
