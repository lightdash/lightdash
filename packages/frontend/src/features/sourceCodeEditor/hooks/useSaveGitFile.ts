import { type ApiError, type ApiGitFileSavedResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type SaveGitFileParams = {
    branch: string;
    path: string;
    content: string;
    sha?: string;
    message?: string;
};

const saveGitFile = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    params: SaveGitFileParams,
) =>
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();

    return useMutation<
        ApiGitFileSavedResponse['results'],
        ApiError,
        SaveGitFileParams
    >({
        mutationFn: (params) => saveGitFile(lightdashApi, projectUuid, params),
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
