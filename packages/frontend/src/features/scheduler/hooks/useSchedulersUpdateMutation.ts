import {
    ApiError,
    SchedulerAndTargets,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const updateScheduler = async (
    uuid: string,
    data: UpdateSchedulerAndTargetsWithoutId,
) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useSchedulersUpdateMutation = (schedulerUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        UpdateSchedulerAndTargetsWithoutId
    >((data) => updateScheduler(schedulerUuid, data), {
        mutationKey: ['update_scheduler'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['chart_schedulers']);
            await queryClient.invalidateQueries(['dashboard_schedulers']);
            await queryClient.invalidateQueries(['scheduler', schedulerUuid]);
            showToastSuccess({
                title: `Success! Scheduled delivery was updated.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to update scheduled delivery`,
                subtitle: error.error.message,
            });
        },
    });
};
