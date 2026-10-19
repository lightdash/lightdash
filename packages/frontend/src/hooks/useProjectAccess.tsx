import { type ApiError, type ProjectMemberProfile } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useQueryError from './useQueryError';

const getProjectAccessQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ProjectMemberProfile[]>({
        url: `/projects/${projectUuid}/access`,
        method: 'GET',
        body: undefined,
    });

export const useProjectAccess = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useQuery<ProjectMemberProfile[], ApiError>({
        queryKey: ['project_access_users', projectUuid],
        queryFn: () => getProjectAccessQuery(lightdashApi, projectUuid),
        onError: (result) => setErrorResponse(result),
        enabled: !!projectUuid,
    });
};
