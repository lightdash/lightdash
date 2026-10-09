import {
    type ApiError,
    type ApiGitPullRequestCreatedResponse,
    type CreateGitPullRequestRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type CreatePullRequestParams = CreateGitPullRequestRequest & {
    branch: string;
};

const createPullRequest = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    params: CreatePullRequestParams,
) =>
    lightdashApi<ApiGitPullRequestCreatedResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches/${encodeURIComponent(params.branch)}/pull-request`,
        method: 'POST',
        body: JSON.stringify({
            title: params.title,
            description: params.description,
        }),
    });

export const useCreatePullRequest = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        ApiGitPullRequestCreatedResponse['results'],
        ApiError,
        CreatePullRequestParams
    >({
        mutationFn: (params) =>
            createPullRequest(lightdashApi, projectUuid, params),
    });
};
