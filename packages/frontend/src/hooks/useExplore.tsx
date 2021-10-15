import { ApiError, ApiExploreResults } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getExplore = async (projectUuid: string, exploreId: string) =>
    lightdashApi<ApiExploreResults>({
        url: `/projects/${projectUuid}/explores/${exploreId}`,
        method: 'GET',
        body: undefined,
    });

export const useExplore = (activeTableName: string | undefined) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const queryKey = ['tables', activeTableName];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () => getExplore(projectUuid, activeTableName || ''),
        enabled: activeTableName !== undefined,
        onError: (result) => setErrorResponse(result),
        retry: false,
    });
};
