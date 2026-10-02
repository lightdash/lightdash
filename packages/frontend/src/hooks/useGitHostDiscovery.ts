import {
    type ApiError,
    type GitHostCredentials,
    type GitHostRepository,
    type SemanticLayerFormat,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

type RepositoryRef = Pick<
    GitHostRepository,
    'id' | 'fullName' | 'azureProject'
>;

export const useGitHostRepositories = () => {
    const queryClient = useQueryClient();
    return useMutation<GitHostRepository[], ApiError, GitHostCredentials>({
        mutationFn: (credentials) =>
            lightdashApi<GitHostRepository[]>({
                url: `/org/git-hosts/repositories`,
                method: 'POST',
                body: JSON.stringify({ credentials }),
                sensitive: true,
            }),
        onSuccess: (repositories, credentials) => {
            queryClient.setQueryData(
                ['git_host_repositories', credentials.host],
                repositories,
            );
        },
    });
};

export const useGitHostBranches = () => {
    const queryClient = useQueryClient();
    return useMutation<
        string[],
        ApiError,
        { credentials: GitHostCredentials; repository: RepositoryRef }
    >({
        mutationFn: (body) =>
            lightdashApi<string[]>({
                url: `/org/git-hosts/branches`,
                method: 'POST',
                body: JSON.stringify(body),
                sensitive: true,
            }),
        onSuccess: (branches, { credentials, repository }) => {
            queryClient.setQueryData(
                ['git_host_branches', credentials.host, repository.fullName],
                branches,
            );
        },
    });
};

export const useSemanticLayerFormat = () => {
    const queryClient = useQueryClient();
    return useMutation<
        SemanticLayerFormat,
        ApiError,
        {
            credentials: GitHostCredentials;
            repository: RepositoryRef;
            branch: string;
            subPath: string;
        }
    >({
        mutationFn: (body) =>
            lightdashApi<SemanticLayerFormat>({
                url: `/org/git-hosts/format`,
                method: 'POST',
                body: JSON.stringify(body),
                sensitive: true,
            }),
        onSuccess: (format, { credentials, repository, branch, subPath }) => {
            queryClient.setQueryData(
                [
                    'git_host_format',
                    credentials.host,
                    repository.fullName,
                    branch,
                    subPath,
                ],
                format,
            );
        },
    });
};
