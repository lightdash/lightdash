import {
    type ApiError,
    type ReassignSchedulerOwnerRequest,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('scheduler');

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
            await queryClient.invalidateQueries(['app_schedulers']);

            const count = variables.schedulerUuids.length;
            showToastSuccess({
                title: t('toasts.reassigned', { count }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('toasts.reassignFailed'),
                apiError: error,
            });
        },
    });
};
