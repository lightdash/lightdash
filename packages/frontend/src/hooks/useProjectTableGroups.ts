import { type ApiError, type ApiTableGroupsResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getProjectTableGroups = (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiTableGroupsResults>({
        url: `/projects/${projectUuid}/table-groups`,
        method: 'GET',
        body: undefined,
    });

export const useProjectTableGroups = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiTableGroupsResults, ApiError>({
        queryKey: ['project', projectUuid, 'table-groups'],
        queryFn: () => getProjectTableGroups(lightdashApi, projectUuid!),
        enabled: Boolean(projectUuid),
    });
};
