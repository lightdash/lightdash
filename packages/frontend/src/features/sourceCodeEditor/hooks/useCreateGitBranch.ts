import {
    type ApiError,
    type ApiGitBranchCreatedResponse,
    type CreateGitBranchRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const createGitBranch = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    params: CreateGitBranchRequest,
) =>
    lightdashApi<ApiGitBranchCreatedResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches`,
        method: 'POST',
        body: JSON.stringify(params),
    });

export const useCreateGitBranch = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();

    return useMutation<
        ApiGitBranchCreatedResponse['results'],
        ApiError,
        CreateGitBranchRequest
    >({
        mutationFn: (params) =>
            createGitBranch(lightdashApi, projectUuid, params),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['gitBranches', projectUuid],
            });
        },
    });
};
