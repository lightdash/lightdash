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
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

const PROJECT_HOMEPAGE_QUERY_KEY = 'project_homepage';

const getResolvedHomepage = async (projectUuid: string) =>
    lightdashApi<ResolvedHomepage | null>({
        url: `/projects/${projectUuid}/homepage`,
        method: 'GET',
        body: undefined,
    });

const getPersonalHomepageApi = async (projectUuid: string) =>
    lightdashApi<string | null>({
        url: `/projects/${projectUuid}/homepage/personal-override`,
        method: 'GET',
        body: undefined,
    });

const setPersonalHomepageApi = async (
    projectUuid: string,
    dashboardUuid: string,
) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/homepage/personal-override`,
        method: 'PATCH',
        body: JSON.stringify({ dashboardUuid }),
    });

const clearPersonalHomepageApi = async (projectUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/homepage/personal-override`,
        method: 'DELETE',
        body: undefined,
    });

const getHomepageForBuilder = async (
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

const listHomepagesApi = async (projectUuid: string) =>
    lightdashApi<ProjectHomepage[]>({
        url: `/projects/${projectUuid}/homepage/list`,
        method: 'GET',
        body: undefined,
    });

const deleteHomepageApi = async (projectUuid: string, homepageUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const createHomepageApi = async (
    projectUuid: string,
    data: CreateProjectHomepageRequest,
) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateHomepageDraftApi = async (
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
    projectUuid: string,
    homepageUuid: string,
    audience: HomepageAudience,
    allowPersonal: boolean,
) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}/publish`,
        method: 'POST',
        body: JSON.stringify({ audience, allowPersonal }),
    });

const viewAsApi = async (projectUuid: string, target: HomepageViewAsTarget) => {
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

const getAssignmentsApi = async (projectUuid: string) =>
    lightdashApi<HomepageAssignment[]>({
        url: `/projects/${projectUuid}/homepage/assignments`,
        method: 'GET',
        body: undefined,
    });

const updateGroupPrioritiesApi = async (
    projectUuid: string,
    groupUuids: string[],
) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/homepage/group-priorities`,
        method: 'PATCH',
        body: JSON.stringify({ groupUuids }),
    });

export const useHomepageBuilderFlag = () => {
    const { data: flag, isLoading } = useServerFeatureFlag(
        CommercialFeatureFlags.HomepageBuilder,
    );
    return { isEnabled: !!flag?.enabled, isLoading };
};

export const useResolvedHomepage = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<ResolvedHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'resolved'],
        queryFn: () => getResolvedHomepage(projectUuid!),
    });

export const usePersonalHomepage = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<string | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'personal'],
        queryFn: () => getPersonalHomepageApi(projectUuid!),
    });

export const useSetPersonalHomepage = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string>(
        (dashboardUuid) => setPersonalHomepageApi(projectUuid, dashboardUuid),
        {
            mutationKey: ['set_personal_homepage'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                ]);
                showToastSuccess({
                    title: 'This dashboard is now your homepage',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to set your homepage',
                    apiError: error,
                });
            },
        },
    );
};

export const useClearPersonalHomepage = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, void>(
        () => clearPersonalHomepageApi(projectUuid),
        {
            mutationKey: ['clear_personal_homepage'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
                ]);
                showToastSuccess({ title: 'Homepage reset to default' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to reset your homepage',
                    apiError: error,
                });
            },
        },
    );
};

export const useHomepageForBuilder = (
    projectUuid: string | undefined,
    {
        enabled = true,
        homepageUuid,
    }: { enabled?: boolean; homepageUuid?: string } = {},
) =>
    useQuery<ProjectHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [
            PROJECT_HOMEPAGE_QUERY_KEY,
            projectUuid,
            'builder',
            homepageUuid ?? 'default',
        ],
        queryFn: () => getHomepageForBuilder(projectUuid!, homepageUuid),
    });

export const useProjectHomepages = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<ProjectHomepage[], ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'list'],
        queryFn: () => listHomepagesApi(projectUuid!),
    });

export const useDeleteHomepage = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string>(
        (homepageUuid) => deleteHomepageApi(projectUuid, homepageUuid),
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
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ProjectHomepage, ApiError, CreateProjectHomepageRequest>(
        (data) => createHomepageApi(projectUuid, data),
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
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ProjectHomepage,
        ApiError,
        { name: string; draftConfig: HomepageConfig }
    >(
        async ({ name, draftConfig }) => {
            const created = await createHomepageApi(projectUuid, { name });
            return updateHomepageDraftApi(projectUuid, created.homepageUuid, {
                draftConfig,
                baseUpdatedAt: created.updatedAt,
            });
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
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ProjectHomepage,
        ApiError,
        UpdateProjectHomepageDraftRequest
    >((data) => updateHomepageDraftApi(projectUuid, homepageUuid!, data), {
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
    });
};

export const useHomepageViewAs = (
    projectUuid: string,
    target: HomepageViewAsTarget | null,
) =>
    useQuery<HomepageViewAsResult, ApiError>({
        enabled: !!target,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'view-as', target],
        queryFn: () => viewAsApi(projectUuid, target!),
    });

export const useHomepageAssignments = (
    projectUuid: string,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<HomepageAssignment[], ApiError>({
        enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'assignments'],
        queryFn: () => getAssignmentsApi(projectUuid),
    });

export const useUpdateGroupPriorities = (projectUuid: string) => {
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string[]>(
        (groupUuids) => updateGroupPrioritiesApi(projectUuid, groupUuids),
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

export const usePublishHomepage = (
    projectUuid: string,
    homepageUuid: string | undefined,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ProjectHomepage,
        ApiError,
        { audience: HomepageAudience; allowPersonal: boolean }
    >(
        ({ audience, allowPersonal }) =>
            publishHomepageApi(
                projectUuid,
                homepageUuid!,
                audience,
                allowPersonal,
            ),
        {
            mutationKey: ['publish_project_homepage'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    PROJECT_HOMEPAGE_QUERY_KEY,
                    projectUuid,
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
