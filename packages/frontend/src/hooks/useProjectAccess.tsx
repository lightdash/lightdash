import { type ApiError, type ProjectMemberProfile } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getProjectAccessQuery = async (projectUuid: string) =>
    lightdashApi<ProjectMemberProfile[]>({
        url: `/projects/${projectUuid}/access`,
        method: 'GET',
        body: undefined,
    });

export const useProjectAccess = (projectUuid: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<ProjectMemberProfile[], ApiError>({
        queryKey: ['project_access_users', projectUuid],
        queryFn: () => getProjectAccessQuery(projectUuid),
        onError: (result) => setErrorResponse(result),
        enabled: !!projectUuid,
    });
};
