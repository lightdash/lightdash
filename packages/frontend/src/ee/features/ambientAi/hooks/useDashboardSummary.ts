import { type ApiError, type DashboardSummary } from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getDashboardSummary = async (
    projectUuid: string,
    dashboardUuid: string,
) => {
    return lightdashApi<DashboardSummary>({
        url: `/ai/${projectUuid}/dashboard/${dashboardUuid}/summary`,
        method: 'GET',
        body: undefined,
    });
};

export const useGetDashboardSummary = (
    projectUuid: string,
    dashboardUuid: string,
) =>
    useQuery<DashboardSummary, ApiError>({
        queryKey: ['ai-dashboard-summary', projectUuid, dashboardUuid],
        queryFn: () => getDashboardSummary(projectUuid, dashboardUuid),
    });

const createDashboardSummary = async (
    projectUuid: string,
    dashboardUuid: string,
    params: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
) => {
    return lightdashApi<DashboardSummary>({
        url: `/ai/${projectUuid}/dashboard/${dashboardUuid}/summary`,
        method: 'POST',
        body: JSON.stringify(params),
    });
};

export const useCreateDashboardSummary = (
    projectUuid: string,
    dashboardUuid: string,
    onError?: (error: ApiError) => void,
) =>
    useMutation<
        DashboardSummary,
        ApiError,
        Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>
    >({
        mutationFn: (params) =>
            createDashboardSummary(projectUuid, dashboardUuid, params),
        onError,
    });
