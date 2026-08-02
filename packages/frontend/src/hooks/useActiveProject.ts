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
import { useAccount } from './user/useAccount';

export const LAST_PROJECT_KEY = 'lastProject';
export const LAST_USER_KEY = 'lastAuthenticatedUserUuid';

export const useActiveProject = () => {
    const { data: account } = useAccount();
    const userUuid =
        account && 'userUuid' in account.user ? account.user.userUuid : null;

    return useQuery<string | null>(
        ['activeProject', userUuid],
        () => {
            // lastProject persists across full-page reloads, so it may belong
            // to a previously signed-in user. Only hand it out once it
            // provably belongs to the current user (a missing marker means a
            // browser from before the marker existed and is trusted).
            if (userUuid) {
                const storedIdentity = localStorage.getItem(LAST_USER_KEY);
                if (storedIdentity !== null && storedIdentity !== userUuid) {
                    return Promise.resolve(null);
                }
            }
            return Promise.resolve(
                localStorage.getItem(LAST_PROJECT_KEY) || null,
            );
        },
        {
            enabled: account !== undefined,
            cacheTime: 0,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
        },
    );
};

// Project-scoped queries keyed by projectUuid need nothing here — a switch
// changes their key. These don't: the pointer query reads localStorage, and
// useValidation keys on ['validation', fromSettings] — scoped to where it is
// read from, but not to the project, so its key survives a switch.
const ACTIVE_PROJECT_DEPENDENT_KEYS = [
    ['activeProject'],
    ['validation'],
    ['project'],
];

const clearProjectCache = (queryClient: QueryClient) =>
    Promise.all(
        ACTIVE_PROJECT_DEPENDENT_KEYS.map((queryKey) =>
            queryClient.invalidateQueries(queryKey),
        ),
    );

// Shared by every useActiveProjectUuid instance: the project a persist is
// already in flight for. localStorage is global, so this guard has to be too.
let persistingProjectUuid: string | undefined;

// Module state outlives a test, so a spec that leaves a mutation unsettled
// would hand its guard to the next one.
export const resetPersistingProjectUuidForTests = () => {
    persistingProjectUuid = undefined;
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
        },
        // Every mutate() builds its own Mutation but they all share the one
        // guard, so an earlier settle must not release a later project's
        // persist: clear only the value this settle was for.
        onSettled: (_data, _error, projectUuid) => {
            if (persistingProjectUuid === projectUuid) {
                persistingProjectUuid = undefined;
            }
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
    const { mutate: deleteActiveProject } = useDeleteActiveProjectMutation();

    // Get organization to access defaultProjectUuid (lightweight call, usually cached)
    const { data: organization, isInitialLoading: isLoadingOrg } =
        useOrganization(useQueryFetchOptions);

    const isLoggedIn = !!organization;

    // Priority 1: Project UUID from URL params
    const { data: paramProject, isInitialLoading: isLoadingParamProject } =
        useProject(params.projectUuid);

    // Priority 2: Last used project from localStorage
    // Only fetch if no param project and we have a lastProjectUuid
    const shouldFetchLastProject =
        isLoggedIn && !params.projectUuid && !!lastProjectUuid;
    const { data: lastProject, isInitialLoading: isLoadingLastProject } =
        useProject(shouldFetchLastProject ? lastProjectUuid : undefined, {
            onError: () => {
                console.warn(
                    `Couldn't find last project ${lastProjectUuid}. Clearing stale reference and falling back to organization default or fallback project.`,
                );
                deleteActiveProject();
            },
        });

    // Priority 3: Organization's default project
    // Only fetch if no param project, no last project, and org has a default
    const shouldFetchDefaultProject =
        isLoggedIn &&
        !params.projectUuid &&
        isLastProjectUuidFetched &&
        !lastProject &&
        !!organization?.defaultProjectUuid;

    const { data: defaultProject, isInitialLoading: isLoadingDefaultProject } =
        useProject(
            shouldFetchDefaultProject
                ? organization?.defaultProjectUuid
                : undefined,
        );

    // Priority 4: Fallback to any project (when org has no defaultProjectUuid)
    // Try to fetch fallback since the last project might have been a preview that was deleted
    const shouldFetchFallbackProjects =
        isLoggedIn &&
        !params.projectUuid &&
        isLastProjectUuidFetched &&
        !lastProject &&
        !isLoadingOrg &&
        (!organization?.defaultProjectUuid ||
            (!isLoadingDefaultProject && !defaultProject));

    const { data: projects, isInitialLoading: isLoadingProjects } = useProjects(
        {
            enabled: shouldFetchFallbackProjects,
        },
    );

    // Find fallback project: first try a non-playground ProjectType.DEFAULT,
    // then any DEFAULT, then first available
    const fallbackProject = shouldFetchFallbackProjects
        ? projects?.find(
              ({ type, provisioningSource }) =>
                  type === ProjectType.DEFAULT &&
                  provisioningSource !== 'playground',
          ) ||
          projects?.find(({ type }) => type === ProjectType.DEFAULT) ||
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

    // Update localStorage when URL param takes precedence or no valid lastProject
    useEffect(() => {
        const newValue =
            paramProject?.projectUuid ||
            defaultProject?.projectUuid ||
            fallbackProject?.projectUuid;

        const hasValidLastProject = !!lastProject?.projectUuid;
        const shouldPersistProject =
            !!params.projectUuid || !hasValidLastProject;

        if (
            !isLoading &&
            shouldPersistProject &&
            newValue &&
            newValue !== lastProjectUuid &&
            persistingProjectUuid !== newValue
        ) {
            persistingProjectUuid = newValue;
            mutate(newValue);
        }
    }, [
        defaultProject?.projectUuid,
        fallbackProject?.projectUuid,
        isLoading,
        lastProject?.projectUuid,
        lastProjectUuid,
        mutate,
        paramProject?.projectUuid,
        params.projectUuid,
    ]);

    return {
        isLoading,
        activeProjectUuid: isLoading ? undefined : activeProjectUuid,
    };
};
