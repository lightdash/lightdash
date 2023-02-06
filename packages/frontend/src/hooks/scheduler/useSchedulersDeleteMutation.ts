import {
    ApiError,
    SchedulerAndTargets,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const deleteScheduler = async (uuid: string) =>
    lightdashApi<undefined>({
        url: `/schedulers/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useSchedulersDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteScheduler, {
        mutationKey: ['delete_chart_scheduler'],
        onSuccess: async (space) => {
            await queryClient.invalidateQueries('chart_schedulers');
            showToastSuccess({
                title: `Success! Scheduled delivery was delete.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete scheduled delivery`,
                subtitle: error.error.message,
            });
        },
    });
};
