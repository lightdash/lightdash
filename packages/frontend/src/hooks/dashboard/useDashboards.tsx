import { ApiError, DashboardBasicDetails } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getDashboards = async (projectUuid: string) =>
    lightdashApi<DashboardBasicDetails[]>({
        url: `/projects/${projectUuid}/dashboards`,
        method: 'GET',
        body: undefined,
    });

export const useDashboards = (projectUuid: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<DashboardBasicDetails[], ApiError>({
        queryKey: ['dashboards', projectUuid],
        queryFn: () => getDashboards(projectUuid || ''),
        enabled: projectUuid !== undefined,
        onError: (result) => setErrorResponse(result),
    });
};
