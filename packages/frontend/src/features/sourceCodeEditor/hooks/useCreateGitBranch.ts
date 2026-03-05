import {
    type ApiError,
    type ApiGitBranchCreatedResponse,
    type CreateGitBranchRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const createGitBranch = async (
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
    const queryClient = useQueryClient();

    return useMutation<
        ApiGitBranchCreatedResponse['results'],
        ApiError,
        CreateGitBranchRequest
    >({
        mutationFn: (params) => createGitBranch(projectUuid, params),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['gitBranches', projectUuid],
            });
        },
    });
};
