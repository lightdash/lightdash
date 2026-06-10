import {
    type ApiError,
    type GithubUserCredential,
    type GitIntegrationConfiguration,
    type GitRepo,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const getGithubConfig = async () =>
    lightdashApi<GitIntegrationConfiguration>({
        url: `/github/config`,
        method: 'GET',
        body: undefined,
    });

export const useGithubConfig = () => {
    const { showToastApiError } = useToaster();

    return useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['github_installation'],
        queryFn: () => getGithubConfig(),
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

const getGithubRepositories = async () =>
    lightdashApi<GitRepo[]>({
        url: `/github/repos/list`,
        method: 'GET',
        body: undefined,
    });

export const useGitHubRepositories = () => {
    const { showToastApiError } = useToaster();

    return useQuery<GitRepo[], ApiError>({
        queryKey: ['github_branches'],
        queryFn: () => getGithubRepositories(),
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

const getGithubUserCredential = async () =>
    lightdashApi<GithubUserCredential | null>({
        url: `/github/user`,
        method: 'GET',
        body: undefined,
    });

export const useGithubUserCredential = () =>
    useQuery<GithubUserCredential | null, ApiError>({
        queryKey: ['github_user_credential'],
        queryFn: () => getGithubUserCredential(),
        retry: false,
        // Linking happens in another tab; refetch when the user comes back
        refetchOnWindowFocus: true,
    });

const unlinkGithubUser = async () =>
    lightdashApi<null>({
        url: `/github/user`,
        method: 'DELETE',
        body: undefined,
    });

export const useUnlinkGithubUserMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError>(
        ['unlink_github_user'],
        () => unlinkGithubUser(),
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

const deleteGithubInstallation = async () =>
    lightdashApi<null>({
        url: `/github/uninstall`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteGithubInstallationMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError>(
        ['delete_github_installation'],
        () => deleteGithubInstallation(),
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
