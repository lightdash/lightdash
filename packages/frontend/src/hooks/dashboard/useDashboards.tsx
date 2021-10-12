import { ApiError, CreateProject, Project, UpdateProject } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getDashboards = async (projectId: string) =>
    lightdashApi<Dashboard[]>({
        url: `/projects/${projectId}/dashboards`,
        method: 'GET',
        body: undefined,
    });

export const useDashboards = (id: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard[], ApiError>({
        queryFn: () => getDashboards(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};
