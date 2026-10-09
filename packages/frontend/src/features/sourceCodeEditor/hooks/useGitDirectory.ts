import {
    type ApiError,
    type ApiGitFileOrDirectoryResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getGitDirectory = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    branch: string,
    path?: string,
) =>
    lightdashApi<ApiGitFileOrDirectoryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches/${encodeURIComponent(branch)}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`,
        method: 'GET',
        body: undefined,
    });

export const useGitDirectory = (
    projectUuid: string | undefined,
    branch: string | undefined,
    path?: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiGitFileOrDirectoryResponse['results'], ApiError>({
        queryKey: ['gitDirectory', projectUuid, branch, path],
        queryFn: () =>
            getGitDirectory(lightdashApi, projectUuid!, branch!, path),
        enabled: !!projectUuid && !!branch,
    });
};
