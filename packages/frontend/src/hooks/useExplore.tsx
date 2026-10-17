import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import {
    useQueries,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
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

/** Loads every source through the same cache used by individual explore views. */
export const useExploreQueries = (exploreNames: (string | undefined)[]) => {
    const projectUuid = useProjectUuid();
    const setErrorResponse = useQueryError();
    const uniqueNames = [...new Set(exploreNames)];
    const queries = useQueries({
        queries: uniqueNames.map((name) => ({
            queryKey: ['tables', name, projectUuid],
            queryFn: () => getExplore(projectUuid!, name!),
            enabled: !!name && !!projectUuid,
            onError: (error: ApiError) => setErrorResponse(error),
            retry: false,
            refetchOnMount: false,
        })),
    });
    const byName = new Map(
        uniqueNames.map((name, index) => [name, queries[index]]),
    );
    return exploreNames.map((name) => byName.get(name)!);
};
