import {
    CommercialFeatureFlags,
    type ApiError,
    type CreateProjectHomepageRequest,
    type ProjectHomepage,
    type PublishedProjectHomepage,
    type UpdateProjectHomepageDraftRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

const PROJECT_HOMEPAGE_QUERY_KEY = 'project_homepage';

const getPublishedHomepage = async (projectUuid: string) =>
    lightdashApi<PublishedProjectHomepage | null>({
        url: `/projects/${projectUuid}/homepage`,
        method: 'GET',
        body: undefined,
    });

const getHomepageForBuilder = async (projectUuid: string) =>
    lightdashApi<ProjectHomepage | null>({
        url: `/projects/${projectUuid}/homepage/builder`,
        method: 'GET',
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

const publishHomepageApi = async (projectUuid: string, homepageUuid: string) =>
    lightdashApi<ProjectHomepage>({
        url: `/projects/${projectUuid}/homepage/${homepageUuid}/publish`,
        method: 'POST',
        body: undefined,
    });

export const useHomepageBuilderFlag = () => {
    const { data: flag, isLoading } = useServerFeatureFlag(
        CommercialFeatureFlags.HomepageBuilder,
    );
    return { isEnabled: !!flag?.enabled, isLoading };
};

export const usePublishedHomepage = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<PublishedProjectHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'published'],
        queryFn: () => getPublishedHomepage(projectUuid!),
    });

export const useHomepageForBuilder = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<ProjectHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: [PROJECT_HOMEPAGE_QUERY_KEY, projectUuid, 'builder'],
        queryFn: () => getHomepageForBuilder(projectUuid!),
    });

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

export const usePublishHomepage = (
    projectUuid: string,
    homepageUuid: string | undefined,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ProjectHomepage, ApiError, void>(
        () => publishHomepageApi(projectUuid, homepageUuid!),
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
