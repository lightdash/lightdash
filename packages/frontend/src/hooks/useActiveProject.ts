import {
    QueryClient,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDefaultProject, useProjects } from './useProjects';

const LAST_PROJECT_KEY = 'lastProject';

export const useActiveProject = () => {
    return useQuery<string | null>(
        ['activeProject'],
        () => Promise.resolve(localStorage.getItem(LAST_PROJECT_KEY) || null),
        {
            cacheTime: 0,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
        },
    );
};

const clearProjectCache = (queryClient: QueryClient) => {
    queryClient.removeQueries(['project']);
    queryClient.removeQueries(['projects']);
    queryClient.invalidateQueries();
};

export const useUpdateActiveProjectMutation = () => {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: (projectUuid) =>
            Promise.resolve(
                localStorage.setItem(LAST_PROJECT_KEY, projectUuid),
            ),
        onSuccess: async () => {
            clearProjectCache(queryClient);
            await queryClient.invalidateQueries(['validations']);
            await queryClient.invalidateQueries(['activeProject']);
        },
    });
};

export const useDeleteActiveProjectMutation = () => {
    const queryClient = useQueryClient();

    return useMutation<void, Error>({
        mutationFn: () =>
            Promise.resolve(localStorage.removeItem(LAST_PROJECT_KEY)),
        onSuccess: () => clearProjectCache(queryClient),
    });
};

export const useActiveProjectUuid = (useQueryFetchOptions?: {
    refetchOnMount: boolean;
}) => {
    const params = useParams<{ projectUuid?: string }>();
    const { data: projects, isInitialLoading: isLoadingProjects } =
        useProjects(useQueryFetchOptions);
    const { data: defaultProject, isLoading: isLoadingDefaultProject } =
        useDefaultProject(useQueryFetchOptions);
    const { data: lastProjectUuid, isInitialLoading: isLoadingLastProject } =
        useActiveProject();
    const { mutate } = useUpdateActiveProjectMutation();

    const isLoading =
        isLoadingProjects || isLoadingDefaultProject || isLoadingLastProject;

    const paramProject = projects?.find(
        (project) => project.projectUuid === params.projectUuid,
    );

    const lastProject = projects?.find(
        (project) => project.projectUuid === lastProjectUuid,
    );

    useEffect(() => {
        const newValue =
            paramProject?.projectUuid || defaultProject?.projectUuid;
        if (!isLoading && !lastProject && newValue) {
            mutate(newValue);
        }
    }, [
        isLoading,
        defaultProject?.projectUuid,
        lastProject,
        mutate,
        paramProject?.projectUuid,
    ]);

    if (isLoading) {
        return {
            isLoading: true,
            activeProjectUuid: undefined,
        };
    }

    return {
        isLoading: false,
        activeProjectUuid:
            paramProject?.projectUuid ||
            lastProject?.projectUuid ||
            defaultProject?.projectUuid,
    };
};
