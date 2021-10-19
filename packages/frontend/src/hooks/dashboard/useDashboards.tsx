import { ApiError, Dashboard } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getDashboards = async (projectId: string) =>
    lightdashApi<Dashboard[]>({
        url: `/projects/${projectId}/dashboards`,
        method: 'GET',
        body: undefined,
    });

export const useDashboards = (projectId: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard[], ApiError>({
        queryKey: ['dashboards'],
        queryFn: () => getDashboards(projectId || ''),
        enabled: projectId !== undefined,
        onError: (result) => setErrorResponse(result),
    });
};
