import {
    type ApiCreateSavedChartSchedulerResponse,
    type ApiError,
    type ApiSavedChartSchedulersResponse,
    type CreateSchedulerAndTargetsWithoutIds,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const getChartSchedulers = async (uuid: string) =>
    lightdashApi<ApiSavedChartSchedulersResponse['results']>({
        url: `/saved/${uuid}/schedulers`,
        method: 'GET',
        body: undefined,
    });

export const useChartSchedulers = (chartUuid: string) =>
    useQuery<ApiSavedChartSchedulersResponse['results'], ApiError>({
        queryKey: ['chart_schedulers', chartUuid],
        queryFn: () => getChartSchedulers(chartUuid),
    });

const createChartScheduler = async (
    uuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<ApiCreateSavedChartSchedulerResponse['results']>({
        url: `/saved/${uuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useChartSchedulerCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiCreateSavedChartSchedulerResponse['results'],
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(({ resourceUuid, data }) => createChartScheduler(resourceUuid, data), {
        mutationKey: ['create_chart_scheduler'],
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries([
                'chart_schedulers',
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
    });
};
