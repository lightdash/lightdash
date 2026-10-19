import {
    type LightdashError,
    type ProjectGroupAccess,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { getProjectGroupAccessList } from '../api/projectGroupAccessApi';

export function useProjectGroupAccessList(
    projectUuid: string,
    useQueryOptions?: UseQueryOptions<ProjectGroupAccess[], LightdashError>,
) {
    const lightdashApi = useLightdashApi();
    return useQuery<ProjectGroupAccess[], LightdashError>({
        queryKey: ['projects', projectUuid, 'groupAccesses'],
        queryFn: () => getProjectGroupAccessList(lightdashApi, projectUuid),
        ...useQueryOptions,
    });
}
