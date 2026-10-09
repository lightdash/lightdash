import { type ApiError, type ApiGitBranchesResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getGitBranches = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiGitBranchesResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/git/branches`,
        method: 'GET',
        body: undefined,
    });

export const useGitBranches = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiGitBranchesResponse['results'], ApiError>({
        queryKey: ['gitBranches', projectUuid],
        queryFn: () => getGitBranches(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
    });
};
