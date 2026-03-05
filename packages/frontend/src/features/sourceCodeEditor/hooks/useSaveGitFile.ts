import { type ApiError, type ApiGitFileSavedResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type SaveGitFileParams = {
    branch: string;
    path: string;
    content: string;
    sha?: string;
    message?: string;
};

const saveGitFile = async (projectUuid: string, params: SaveGitFileParams) =>
    lightdashApi<ApiGitFileSavedResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches/${encodeURIComponent(params.branch)}/files`,
        method: 'PUT',
        body: JSON.stringify({
            path: params.path,
            content: params.content,
            sha: params.sha,
            message: params.message,
        }),
    });

export const useSaveGitFile = (projectUuid: string) => {
    const queryClient = useQueryClient();

    return useMutation<
        ApiGitFileSavedResponse['results'],
        ApiError,
        SaveGitFileParams
    >({
        mutationFn: (params) => saveGitFile(projectUuid, params),
        onSuccess: async (data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: [
                    'gitFileContent',
                    projectUuid,
                    variables.branch,
                    variables.path,
                ],
            });
            await queryClient.invalidateQueries({
                queryKey: ['gitDirectory', projectUuid, variables.branch],
            });
        },
    });
};
