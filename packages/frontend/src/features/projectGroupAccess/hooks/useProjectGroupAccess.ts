import {
    type LightdashError,
    type ProjectGroupAccess,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getProjectGroupAccessList } from '../api/projectGroupAccessApi';

export function useProjectGroupAccessList(
    projectUuid: string,
    useQueryOptions?: UseQueryOptions<ProjectGroupAccess[], LightdashError>,
) {
    return useQuery<ProjectGroupAccess[], LightdashError>({
        queryKey: ['projects', projectUuid, 'groupAccesses'],
        queryFn: () => getProjectGroupAccessList(projectUuid),
        ...useQueryOptions,
    });
}
