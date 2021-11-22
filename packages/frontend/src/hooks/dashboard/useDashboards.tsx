import { ApiError, DashboardBasicDetails } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getDashboards = async (projectId: string) =>
    lightdashApi<DashboardBasicDetails[]>({
        url: `/projects/${projectId}/dashboards`,
        method: 'GET',
        body: undefined,
    });

export const useDashboards = (projectId: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<DashboardBasicDetails[], ApiError>({
        queryKey: ['dashboards'],
        queryFn: () => getDashboards(projectId || ''),
        enabled: projectId !== undefined,
        onError: (result) => setErrorResponse(result),
    });
};
