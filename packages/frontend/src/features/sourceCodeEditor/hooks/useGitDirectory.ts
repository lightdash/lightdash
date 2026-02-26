import {
    type ApiError,
    type ApiGitFileOrDirectoryResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getGitDirectory = async (
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
) =>
    useQuery<ApiGitFileOrDirectoryResponse['results'], ApiError>({
        queryKey: ['gitDirectory', projectUuid, branch, path],
        queryFn: () => getGitDirectory(projectUuid!, branch!, path),
        enabled: !!projectUuid && !!branch,
    });
