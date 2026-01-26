import {
    type ApiCreateDashboardSchedulerResponse,
    type ApiDashboardSchedulersResponse,
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const getDashboardSchedulers = async (uuid: string) =>
    lightdashApi<ApiDashboardSchedulersResponse['results']>({
        url: `/dashboards/${uuid}/schedulers`,
        method: 'GET',
        body: undefined,
    });

export const useDashboardSchedulers = (dashboardUuid: string) =>
    useQuery<ApiDashboardSchedulersResponse['results'], ApiError>({
        queryKey: ['dashboard_schedulers', dashboardUuid],
        queryFn: () => getDashboardSchedulers(dashboardUuid),
    });

const createDashboardScheduler = async (
    uuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<ApiCreateDashboardSchedulerResponse['results']>({
        url: `/dashboards/${uuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useDashboardSchedulerCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiCreateDashboardSchedulerResponse['results'],
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(
        ({ resourceUuid, data }) =>
            createDashboardScheduler(resourceUuid, data),
        {
            mutationKey: ['create_dashboard_scheduler'],
            onSuccess: async (_, variables) => {
                await queryClient.invalidateQueries([
                    'dashboard_schedulers',
                    variables.resourceUuid,
                ]);
                showToastSuccess({
                    title: `Success! Scheduled delivery was created.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create scheduled delivery`,
                    apiError: error,
                });
            },
        },
    );
};
