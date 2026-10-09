import {
    type ApiError,
    type ApiGitFileOrDirectoryResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getGitFileContent = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    branch: string,
    filePath: string,
) =>
    lightdashApi<ApiGitFileOrDirectoryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches/${encodeURIComponent(branch)}/files?path=${encodeURIComponent(filePath)}`,
        method: 'GET',
        body: undefined,
    });

export const useGitFileContent = (
    projectUuid: string | undefined,
    branch: string | undefined,
    filePath: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiGitFileOrDirectoryResponse['results'], ApiError>({
        queryKey: ['gitFileContent', projectUuid, branch, filePath],
        queryFn: () =>
            getGitFileContent(lightdashApi, projectUuid!, branch!, filePath!),
        enabled: !!projectUuid && !!branch && !!filePath,
    });
};
