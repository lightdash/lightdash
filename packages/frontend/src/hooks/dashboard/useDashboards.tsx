import { ApiError, DashboardBasicDetails } from 'common';
import { useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getDashboards = async (projectUuid: string) =>
    lightdashApi<DashboardBasicDetails[]>({
        url: `/projects/${projectUuid}/dashboards`,
        method: 'GET',
        body: undefined,
    });

const getDashboardsContainingChart = async (
    projectUuid: string,
    chartId: string,
) =>
    lightdashApi<DashboardBasicDetails[]>({
        url: `/projects/${projectUuid}/dashboards?chartUuid=${chartId}`,
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

export const useDashboardsContainingChart = (
    projectUuid: string,
    chartId: string,
) => {
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    return useQuery<DashboardBasicDetails[], ApiError>({
        queryKey: ['dashboards', projectUuid],
        queryFn: () => getDashboardsContainingChart(projectUuid, chartId),
        enabled: projectUuid !== undefined,
        onSuccess: async () => {
            await queryClient.invalidateQueries('dashboards');
        },
        onError: (result) => setErrorResponse(result),
    });
};
