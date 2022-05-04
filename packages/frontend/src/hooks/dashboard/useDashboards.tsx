import { ApiError, DashboardBasicDetails } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

export const getDashboards = async (projectUuid: string, chartId?: string) => {
    const queryChartId: string = chartId ? `?chartUuid=${chartId}` : '';

    return lightdashApi<DashboardBasicDetails[]>({
        url: `/projects/${projectUuid}/dashboards${queryChartId}`,
        method: 'GET',
        body: undefined,
    });
};

export const useDashboards = (projectUuid: string, chartId?: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<DashboardBasicDetails[], ApiError>({
        queryKey: ['dashboards', projectUuid],
        queryFn: () => getDashboards(projectUuid, chartId || ''),
        enabled: projectUuid !== undefined,
        onError: (result) => setErrorResponse(result),
    });
};
