import {
    type ApiError,
    type ApiGitFileOrDirectoryResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getGitFileContent = async (
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
) =>
    useQuery<ApiGitFileOrDirectoryResponse['results'], ApiError>({
        queryKey: ['gitFileContent', projectUuid, branch, filePath],
        queryFn: () => getGitFileContent(projectUuid!, branch!, filePath!),
        enabled: !!projectUuid && !!branch && !!filePath,
    });
