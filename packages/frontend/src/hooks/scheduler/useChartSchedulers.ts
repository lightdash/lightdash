import {
    ApiError,
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerAndTargets,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getChartSchedulers = async (uuid: string) =>
    lightdashApi<SchedulerAndTargets[]>({
        url: `/saved/${uuid}/schedulers`,
        method: 'GET',
        body: undefined,
    });

export const useChartSchedulers = (chartUuid: string) =>
    useQuery<SchedulerAndTargets[], ApiError>({
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

export const useChartSchedulersCreateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(({ resourceUuid, data }) => createChartSchedulers(resourceUuid, data), {
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
        onError: (error) => {
            showToastError({
                title: `Failed to create scheduled delivery`,
                subtitle: error.error.message,
            });
        },
    });
};
