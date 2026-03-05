import { type ApiError, type ApiGitBranchesResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getGitBranches = async (projectUuid: string) =>
    lightdashApi<ApiGitBranchesResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches`,
        method: 'GET',
        body: undefined,
    });

export const useGitBranches = (projectUuid: string | undefined) =>
    useQuery<ApiGitBranchesResponse['results'], ApiError>({
        queryKey: ['gitBranches', projectUuid],
        queryFn: () => getGitBranches(projectUuid!),
        enabled: !!projectUuid,
    });
