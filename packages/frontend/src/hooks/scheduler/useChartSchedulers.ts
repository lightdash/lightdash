import {
    ApiError,
    ChartScheduler,
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerAndTargets,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getChartSchedulers = async (uuid: string) =>
    lightdashApi<ChartScheduler[]>({
        url: `/saved/${uuid}/schedulers`,
        method: 'GET',
        body: undefined,
    });

export const useChartSchedulers = (chartUuid: string) =>
    useQuery<ChartScheduler[], ApiError>({
        queryKey: ['chart_schedulers', chartUuid],
        queryFn: () => getChartSchedulers(chartUuid),
    });

const createChartSchedulers = async (
    uuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/saved/${uuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useChartSchedulersCreateMutation = (chartUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        CreateSchedulerAndTargetsWithoutIds
    >((data) => createChartSchedulers(chartUuid, data), {
        mutationKey: ['create_chart_scheduler'],
        onSuccess: async (space) => {
            await queryClient.invalidateQueries([
                'chart_schedulers',
                chartUuid,
            ]);
            showToastSuccess({
                title: `Success! Scheduled delivery was created.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to create scheduled delivery`,
                subtitle: error.error.message,
            });
        },
    });
};
