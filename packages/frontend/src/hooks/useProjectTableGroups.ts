import { type ApiError, type ApiTableGroupsResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getProjectTableGroups = (projectUuid: string) =>
    lightdashApi<ApiTableGroupsResults>({
        url: `/projects/${projectUuid}/table-groups`,
        method: 'GET',
        body: undefined,
    });

export const useProjectTableGroups = (projectUuid: string | undefined) =>
    useQuery<ApiTableGroupsResults, ApiError>({
        queryKey: ['project', projectUuid, 'table-groups'],
        queryFn: () => getProjectTableGroups(projectUuid!),
        enabled: Boolean(projectUuid),
    });
