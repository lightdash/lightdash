import {
    type ApiError,
    type ReassignSchedulerOwnerRequest,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const reassignSchedulerOwner = async (
    projectUuid: string,
    data: ReassignSchedulerOwnerRequest,
) =>
    lightdashApi<SchedulerAndTargets[]>({
        url: `/schedulers/${projectUuid}/reassign-owner`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useSchedulerReassignOwnerMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        SchedulerAndTargets[],
        ApiError,
        ReassignSchedulerOwnerRequest
    >((data) => reassignSchedulerOwner(projectUuid, data), {
        mutationKey: ['reassign_scheduler_owner'],
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries(['paginatedSchedulers']);
            await queryClient.invalidateQueries(['chart_schedulers']);
            await queryClient.invalidateQueries(['dashboard_schedulers']);

            const count = variables.schedulerUuids.length;
            showToastSuccess({
                title: `Successfully reassigned ${count} scheduled ${
                    count === 1 ? 'delivery' : 'deliveries'
                }`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to reassign scheduled delivery owner',
                apiError: error,
            });
        },
    });
};
