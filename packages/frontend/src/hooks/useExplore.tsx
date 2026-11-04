import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import {
    useQueries,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';

const getExplore = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    exploreId: string,
) => {
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

    return useExploreByProjectUuid(
        activeTableName,
        projectUuid,
        useQueryOptions,
    );
};

export const useExploreByProjectUuid = (
    activeTableName: string | undefined,
    projectUuid: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();

    const queryKey = ['tables', activeTableName, projectUuid];
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () =>
            getExplore(lightdashApi, projectUuid!, activeTableName || ''),
        enabled: !!activeTableName && !!projectUuid,
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};

/** Loads several explores through the shared cache; the array is stable while their data is. */
export const useExploreQueries = (
    exploreNames: (string | undefined)[],
): (ApiExploreResults | undefined)[] => {
    const lightdashApi = useLightdashApi();
    const projectUuid = useProjectUuid();
    const setErrorResponse = useQueryError();
    const uniqueNames = [...new Set(exploreNames)];
    const queries = useQueries({
        queries: uniqueNames.map((name) => ({
            queryKey: ['tables', name, projectUuid],
            queryFn: () =>
                projectUuid && name
                    ? getExplore(lightdashApi, projectUuid, name)
                    : Promise.reject(new Error('Missing explore')),
            enabled: !!name && !!projectUuid,
            onError: (error: ApiError) => setErrorResponse(error),
            retry: false,
            refetchOnMount: false,
        })),
    });
    const data = exploreNames.map(
        (name) => queries[uniqueNames.indexOf(name)]?.data,
    );
    const previous = useRef(data);
    if (
        data.length !== previous.current.length ||
        data.some((explore, index) => explore !== previous.current[index])
    ) {
        previous.current = data;
    }
    return previous.current;
};
