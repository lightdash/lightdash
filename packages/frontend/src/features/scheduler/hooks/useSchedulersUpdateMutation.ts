import {
    type ApiError,
    type SchedulerAndTargets,
    type UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation('scheduler');
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        UpdateSchedulerAndTargetsWithoutId
    >((data) => updateScheduler(schedulerUuid, data), {
        mutationKey: ['update_scheduler'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['chart_schedulers']);
            await queryClient.invalidateQueries(['dashboard_schedulers']);
            await queryClient.invalidateQueries(['sql_chart_schedulers']);
            await queryClient.invalidateQueries(['app_schedulers']);
            await queryClient.invalidateQueries(['scheduler', schedulerUuid]);
            showToastSuccess({
                title: t('toasts.updated'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('toasts.updateFailed'),
                apiError: error,
            });
        },
    });
};

const updateSchedulerEnabled = async (uuid: string, enabled: boolean) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}/enabled`,
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
    });

export const useSchedulersEnabledUpdateMutation = (schedulerUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { t } = useTranslation('scheduler');
    return useMutation<SchedulerAndTargets, ApiError, boolean>(
        (enabled) => updateSchedulerEnabled(schedulerUuid, enabled),
        {
            mutationKey: ['update_scheduler_enabled'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['chart_schedulers']);
                await queryClient.invalidateQueries(['dashboard_schedulers']);
                await queryClient.invalidateQueries(['sql_chart_schedulers']);
                await queryClient.invalidateQueries(['app_schedulers']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('toasts.updateFailed'),
                    apiError: error,
                });
            },
        },
    );
};
