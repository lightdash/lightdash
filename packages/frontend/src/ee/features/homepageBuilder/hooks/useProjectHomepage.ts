import {
    CommercialFeatureFlags,
    type ApiError,
    type CreateProjectHomepageRequest,
    type HomepageAssignment,
    type HomepageAudience,
    type HomepageConfig,
    type HomepageViewAsResult,
    type HomepageViewAsTarget,
    type ProjectHomepage,
    type ResolvedHomepage,
    type UpdateProjectHomepageDraftRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { ANNOUNCEMENTS_QUERY_KEY } from './useAnnouncements';
import { useOrgHomepageSettings } from './useOrgHomepageSettings';

const PROJECT_HOMEPAGE_QUERY_KEY = 'project_homepage';

const getResolvedHomepage = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ResolvedHomepage | null>({
        url: `/projects/${projectUuid}/homepage`,
        method: 'GET',
        body: undefined,
    });

const getHomepageForBuilder = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    homepageUuid?: string,
) =>
    lightdashApi<ProjectHomepage | null>({
        url: `/projects/${projectUuid}/homepage/builder${
            homepageUuid ? `?homepageUuid=${homepageUuid}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

const listHomepagesApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ProjectHomepage[]>({
        url: `/projects/${projectUuid}/homepage/list`,
        method: 'GET',
        body: undefined,
    });

const deleteHomepageApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    homepageUuid: string,
) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const createHomepageApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: CreateProjectHomepageRequest,
) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateHomepageDraftApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    homepageUuid: string,
    data: UpdateProjectHomepageDraftRequest,
) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const publishHomepageApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    homepageUuid: string,
    audience: HomepageAudience,
) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}/publish`,
        method: 'POST',
        body: JSON.stringify({ audience }),
    });

const discardHomepageDraftApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    homepageUuid: string,
) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}/discard-draft`,
        method: 'POST',
        body: undefined,
    });

const viewAsApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    target: HomepageViewAsTarget,
) => {
    const params = new URLSearchParams({ targetType: target.type });
    if (target.type === 'user') params.set('userUuid', target.userUuid);
    if (target.type === 'group') params.set('groupUuid', target.groupUuid);
    if (target.type === 'role') params.set('role', target.role);
    return lightdashApi<HomepageViewAsResult>({
        url: `/projects/${projectUuid}/homepage/view-as?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

const getAssignmentsApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<HomepageAssignment[]>({
        url: `/projects/${projectUuid}/homepage/assignments`,
        method: 'GET',
        body: undefined,
    });

const updateGroupPrioritiesApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    groupUuids: string[],
) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/homepage/group-priorities`,
        method: 'PATCH',
        body: JSON.stringify({ groupUuids }),
    });

export const useHomepageBuilderFlag = () => {
    const { data: flag, isLoading: isFlagLoading } = useServerFeatureFlag(
        CommercialFeatureFlags.HomepageBuilder,
    );
    // Homepage v2 is on when the org opted in via settings OR the commercial
    // flag is set — the flag remains as the legacy path/kill-switch while the
    // opt-in flow rolls out. Must match the backend rule in
    // ProjectHomepageService.isHomepageEnabled.
    const settings = useOrgHomepageSettings();
    return {
        isEnabled: !!flag?.enabled || !!settings.data?.enabled,
        isLoading: isFlagLoading || settings.isInitialLoading,
    };
};

export const useResolvedHomepage = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ResolvedHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'resolved'],
        queryFn: () => getResolvedHomepage(lightdashApi, projectUuid!),
    });
};

export const useHomepageForBuilder = (
    projectUuid: string | undefined,
    {
        enabled = true,
        homepageUuid,
    }: { enabled?: boolean; homepageUuid?: string } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ProjectHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [
            PROJECT_HOMEPAGE_QUERY_KEY,
            projectUuid,
            'builder',
            homepageUuid ?? 'default',
        ],
        queryFn: () =>
            getHomepageForBuilder(lightdashApi, projectUuid!, homepageUuid),
        // The editor snapshots the draft on mount, so always refetch: with the
        // global 30s staleTime a warm cache would skip the fetch, leaving
        // isFetchedAfterMount false and the builder stuck on a spinner.
        refetchOnMount: 'always',
    });
};

export const useProjectHomepages = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ProjectHomepage[], ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'list'],
        queryFn: () => listHomepagesApi(lightdashApi, projectUuid!),
    });
};

export const useDeleteHomepage = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string>(
        (homepageUuid) =>
            deleteHomepageApi(lightdashApi, projectUuid, homepageUuid),
        {
            mutationKey: ['delete_project_homepage'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                ]);
                showToastSuccess({ title: 'Homepage deleted' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to delete homepage',
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateHomepage = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ProjectHomepage, ApiError, CreateProjectHomepageRequest>(
        (data) => createHomepageApi(lightdashApi, projectUuid, data),
        {
            mutationKey: ['create_project_homepage'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create homepage',
                    apiError: error,
                });
            },
        },
    );
};

// Creates a homepage, then immediately overwrites its draft — used by the
// first-time empty state, which skips the blank/duplicate name modal and
// seeds the draft straight from the caller instead.
export const useCreateHomepageWithDraft = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ProjectHomepage,
        ApiError,
        { name: string; draftConfig: HomepageConfig }
    >(
        async ({ name, draftConfig }) => {
            const created = await createHomepageApi(lightdashApi, projectUuid, {
                name,
            });
            return updateHomepageDraftApi(
                lightdashApi,
                projectUuid,
                created.homepageUuid,
                {
                    draftConfig,
                    baseUpdatedAt: created.updatedAt,
                },
            );
        },
        {
            mutationKey: ['create_project_homepage_with_draft'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create homepage',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateHomepageDraft = (
    projectUuid: string,
    homepageUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ProjectHomepage,
        ApiError,
        UpdateProjectHomepageDraftRequest
    >(
        (data) =>
            updateHomepageDraftApi(
                lightdashApi,
                projectUuid,
                homepageUuid!,
                data,
            ),
        {
            mutationKey: ['update_project_homepage_draft'],
            onSettled: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                    'builder',
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to save draft',
                    apiError: error,
                });
            },
        },
    );
};

export const useHomepageViewAs = (
    projectUuid: string,
    target: HomepageViewAsTarget | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<HomepageViewAsResult, ApiError>({
        enabled: !!target,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'view-as', target],
        queryFn: () => viewAsApi(lightdashApi, projectUuid, target!),
    });
};

export const useHomepageAssignments = (
    projectUuid: string,
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<HomepageAssignment[], ApiError>({
        enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'assignments'],
        queryFn: () => getAssignmentsApi(lightdashApi, projectUuid),
    });
};

export const useUpdateGroupPriorities = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string[]>(
        (groupUuids) =>
            updateGroupPrioritiesApi(lightdashApi, projectUuid, groupUuids),
        {
            mutationKey: ['update_homepage_group_priorities'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                    'assignments',
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to reorder group priority',
                    apiError: error,
                });
            },
        },
    );
};

export const useDiscardHomepageDraft = (
    projectUuid: string,
    homepageUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ProjectHomepage, ApiError, void>(
        () => discardHomepageDraftApi(lightdashApi, projectUuid, homepageUuid!),
        {
            mutationKey: ['discard_project_homepage_draft'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                ]);
                showToastSuccess({ title: 'Draft reverted to published' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to revert draft',
                    apiError: error,
                });
            },
        },
    );
};

export const usePublishHomepage = (
    projectUuid: string,
    homepageUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ProjectHomepage,
        ApiError,
        { audience: HomepageAudience }
    >(
        ({ audience }) =>
            publishHomepageApi(
                lightdashApi,
                projectUuid,
                homepageUuid!,
                audience,
            ),
        {
            mutationKey: ['publish_project_homepage'],
            onSuccess: async () => {
                await Promise.all([
                    queryClient.invalidateQueries([
                        PROJECT_HOMEPAGE_QUERY_KEY,
                        projectUuid,
                    ]),
                    // Publishing also flips draft announcements to published.
                    queryClient.invalidateQueries([
                        ANNOUNCEMENTS_QUERY_KEY,
                        projectUuid,
                    ]),
                ]);
                showToastSuccess({ title: 'Homepage published' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to publish homepage',
                    apiError: error,
                });
            },
        },
    );
};
