import { ProjectType } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useOrganization } from './organization/useOrganization';
import { useProject } from './useProject';
import { useProjects } from './useProjects';

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

const clearProjectCache = async (queryClient: QueryClient) => {
    queryClient.removeQueries(['project']);
    queryClient.removeQueries(['projects']);
    await queryClient.invalidateQueries();
};

export const useUpdateActiveProjectMutation = () => {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: (projectUuid) =>
            Promise.resolve(
                localStorage.setItem(LAST_PROJECT_KEY, projectUuid),
            ),
        onSuccess: async () => {
            await clearProjectCache(queryClient);
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
    const { data: lastProjectUuid, isFetched: isLastProjectUuidFetched } =
        useActiveProject();
    const { mutate } = useUpdateActiveProjectMutation();

    // Get organization to access defaultProjectUuid (lightweight call, usually cached)
    const { data: organization, isInitialLoading: isLoadingOrg } =
        useOrganization(useQueryFetchOptions);

    // Priority 1: Project UUID from URL params
    const { data: paramProject, isInitialLoading: isLoadingParamProject } =
        useProject(params.projectUuid);

    // Priority 2: Last used project from localStorage
    // Only fetch if no param project and we have a lastProjectUuid
    const shouldFetchLastProject = !params.projectUuid && !!lastProjectUuid;
    const { data: lastProject, isInitialLoading: isLoadingLastProject } =
        useProject(shouldFetchLastProject ? lastProjectUuid : undefined);

    // Priority 3: Organization's default project
    // Only fetch if no param project, no last project, and org has a default
    const shouldFetchDefaultProject =
        !params.projectUuid &&
        isLastProjectUuidFetched &&
        !lastProjectUuid &&
        !!organization?.defaultProjectUuid;
    const { data: defaultProject, isInitialLoading: isLoadingDefaultProject } =
        useProject(
            shouldFetchDefaultProject
                ? organization?.defaultProjectUuid
                : undefined,
        );

    // Priority 4: Fallback to any project (when org has no defaultProjectUuid)
    // Only fetch projects list if we have no other option AND localStorage check is complete
    const shouldFetchFallbackProjects =
        !params.projectUuid &&
        isLastProjectUuidFetched &&
        !lastProjectUuid &&
        !isLoadingOrg &&
        !organization?.defaultProjectUuid;

    const { data: projects, isInitialLoading: isLoadingProjects } = useProjects(
        {
            enabled: shouldFetchFallbackProjects,
        },
    );

    // Find fallback project: first try ProjectType.DEFAULT, then first available
    const fallbackProject = shouldFetchFallbackProjects
        ? projects?.find(({ type }) => type === ProjectType.DEFAULT) ||
          projects?.[0]
        : undefined;

    const isLoading =
        // Still loading if we haven't checked localStorage yet (unless we have URL param)
        (!params.projectUuid && !isLastProjectUuidFetched) ||
        isLoadingParamProject ||
        (shouldFetchLastProject && isLoadingLastProject) ||
        (shouldFetchDefaultProject && isLoadingDefaultProject) ||
        (shouldFetchFallbackProjects && isLoadingProjects) ||
        (!params.projectUuid && !lastProjectUuid && isLoadingOrg);

    // Determine the active project UUID
    const activeProjectUuid =
        paramProject?.projectUuid ||
        lastProject?.projectUuid ||
        defaultProject?.projectUuid ||
        fallbackProject?.projectUuid;

    // Update localStorage when we find an active project but don't have one stored
    useEffect(() => {
        const newValue =
            paramProject?.projectUuid ||
            defaultProject?.projectUuid ||
            fallbackProject?.projectUuid;
        if (!isLoading && !lastProjectUuid && newValue) {
            mutate(newValue);
        }
    }, [
        isLoading,
        defaultProject?.projectUuid,
        fallbackProject?.projectUuid,
        lastProjectUuid,
        mutate,
        paramProject?.projectUuid,
    ]);

    return {
        isLoading,
        activeProjectUuid: isLoading ? undefined : activeProjectUuid,
    };
};
