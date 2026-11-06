import {
    type ApiError,
    type GithubUserCredential,
    type GitIntegrationConfiguration,
    type GitRepo,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const getGithubConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<GitIntegrationConfiguration>({
        url: `/github/config`,
        method: 'GET',
        body: undefined,
    });

export const useGithubConfig = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();

    return useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['github_installation'],
        queryFn: () => getGithubConfig(lightdashApi),
        retry: false,
        staleTime: 5 * 60 * 1000, // 5 minutes - the installation rarely changes; install detection drives its own refetch()
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return; // Ignore missing installation errors or unauthorized in demo

            showToastApiError({
                title: 'Failed to get GitHub integration',
                apiError: error,
            });
        },
    });
};

const getGithubRepositories = async (lightdashApi: LightdashApi) =>
    lightdashApi<GitRepo[]>({
        url: `/github/repos/list`,
        method: 'GET',
        body: undefined,
    });

export const useGitHubRepositories = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();

    return useQuery<GitRepo[], ApiError>({
        queryKey: ['github_branches'],
        queryFn: () => getGithubRepositories(lightdashApi),
        retry: false,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return; // Ignore missing installation errors or unauthorized in demo

            showToastApiError({
                title: 'Failed to get GitHub integration',
                apiError: error,
            });
        },
    });
};
export const GITHUB_USER_AUTHORIZE_URL = `/api/v1/github/user/authorize`;

const getGithubUserCredential = async (lightdashApi: LightdashApi) =>
    lightdashApi<GithubUserCredential | null>({
        url: `/github/user`,
        method: 'GET',
        body: undefined,
    });

export const useGithubUserCredential = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<GithubUserCredential | null, ApiError>({
        queryKey: ['github_user_credential'],
        queryFn: () => getGithubUserCredential(lightdashApi),
        retry: false,
        // Linking happens in another tab; refetch when the user comes back
        refetchOnWindowFocus: true,
    });
};

const unlinkGithubUser = async (lightdashApi: LightdashApi) =>
    lightdashApi<null>({
        url: `/github/user`,
        method: 'DELETE',
        body: undefined,
    });

export const useUnlinkGithubUserMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError>(
        ['unlink_github_user'],
        () => unlinkGithubUser(lightdashApi),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['github_user_credential']);
                showToastSuccess({
                    title: 'GitHub account unlinked',
                    subtitle:
                        'Write-backs will be authored by the Lightdash bot again.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to unlink GitHub account',
                    apiError: error,
                });
            },
        },
    );
};

const deleteGithubInstallation = async (lightdashApi: LightdashApi) =>
    lightdashApi<null>({
        url: `/github/uninstall`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteGithubInstallationMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError>(
        ['delete_github_installation'],
        () => deleteGithubInstallation(lightdashApi),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['github_branches']);
                showToastSuccess({
                    title: 'GitHub integration deleted',
                    subtitle:
                        'You have successfully deleted your GitHub integration.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to delete GitHub integration',
                    apiError: error,
                });
            },
        },
    );
};
