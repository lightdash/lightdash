import {
    type ApiError,
    type ApiGitFileContent,
    type PullRequestCreated,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getExploreYamlFile = async (
    projectUuid: string,
    exploreName: string,
): Promise<ApiGitFileContent> =>
    lightdashApi({
        url: `/projects/${projectUuid}/git-integration/explores/${exploreName}/files`,
        method: 'GET',
        body: undefined,
    }) as Promise<ApiGitFileContent>;

export const useExploreYamlFile = (
    projectUuid: string | undefined,
    exploreName: string | undefined,
    enabled = true,
) =>
    useQuery<ApiGitFileContent, ApiError>({
        queryKey: ['explore-yaml', projectUuid, exploreName],
        queryFn: () => getExploreYamlFile(projectUuid!, exploreName!),
        enabled: enabled && !!projectUuid && !!exploreName,
    });

type CreateFilePRPayload = {
    filePath: string;
    content: string;
    originalSha: string;
    title: string;
    description: string;
};

const createFilePullRequest = async (
    projectUuid: string,
    payload: CreateFilePRPayload,
): Promise<PullRequestCreated> =>
    lightdashApi<PullRequestCreated>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/file-change`,
        method: 'POST',
        body: JSON.stringify(payload),
    });

export const useCreateFilePullRequest = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<PullRequestCreated, ApiError, CreateFilePRPayload>({
        mutationFn: (payload) => createFilePullRequest(projectUuid, payload),
        mutationKey: ['create-file-pull-request', projectUuid],
        onSuccess: (pullRequest) => {
            window.open(pullRequest.prUrl, '_blank');

            showToastSuccess({
                title: 'Pull request created successfully!',
                action: {
                    children: 'Open Pull Request',
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(pullRequest.prUrl, '_blank');
                    },
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create pull request',
                apiError: error,
            });
        },
    });
};
