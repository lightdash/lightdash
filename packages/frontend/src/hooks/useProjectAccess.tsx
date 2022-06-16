import { ApiError, ProjectMemberProfile } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getProjectAccessQuery = async (projectUuid: string) =>
    lightdashApi<ProjectMemberProfile[]>({
        url: `/projects/${projectUuid}/projectAccess`,
        method: 'GET',
        body: undefined,
    });

export const useProjectAccess = (projectUuid: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<ProjectMemberProfile[], ApiError>({
        queryKey: ['project_access', projectUuid],
        queryFn: () => getProjectAccessQuery(projectUuid),
        onError: (result) => setErrorResponse(result),
    });
};
