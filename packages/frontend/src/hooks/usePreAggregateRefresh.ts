import { type ApiError } from '@lightdash/common';
import { IconRefreshDot } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useSchedulerJobsContext from '../providers/SchedulerJobs/useSchedulerJobsContext';
import useToaster from './toaster/useToaster';

type RefreshOptions = {
    showToast?: boolean;
};

const refreshAllPreAggregates = async (projectUuid: string) =>
    lightdashApi<{ jobIds: string[] }>({
        url: `/projects/${projectUuid}/pre-aggregates/refresh`,
        method: 'POST',
        body: undefined,
    });

export const useRefreshAllPreAggregates = (
    projectUuid: string,
    options: RefreshOptions = {},
) => {
    const { showToast = true } = options;
    const { t } = useTranslation('app');
    const { showToastApiError } = useToaster();
    const { registerJobs } = useSchedulerJobsContext();
    const queryClient = useQueryClient();

    return useMutation<{ jobIds: string[] }, ApiError>(
        () => refreshAllPreAggregates(projectUuid),
        {
            mutationKey: ['refreshAllPreAggregates', projectUuid],
            onSuccess: (data) => {
                // Immediately refetch so the table shows in_progress status
                void queryClient.invalidateQueries({
                    queryKey: ['preAggregateMaterializations', projectUuid],
                });
                registerJobs({
                    jobIds: data.jobIds,
                    showToast,
                    toastKey: 'pre-aggregate-rebuild',
                    toastTitle: t('usePreAggregateRefresh.rebuildingAll'),
                    toastIcon: IconRefreshDot,
                    onComplete: () => {
                        void queryClient.invalidateQueries({
                            queryKey: [
                                'preAggregateMaterializations',
                                projectUuid,
                            ],
                        });
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'usePreAggregateRefresh.failedToRebuildPreAggregates',
                    ),
                    apiError: error,
                });
            },
        },
    );
};

const refreshPreAggregateByDefinitionName = async (
    projectUuid: string,
    preAggregateDefinitionName: string,
) =>
    lightdashApi<{ jobIds: string[] }>({
        url: `/projects/${projectUuid}/pre-aggregates/definitions/${encodeURIComponent(preAggregateDefinitionName)}/refresh`,
        method: 'POST',
        body: undefined,
    });

export const useRefreshPreAggregateByDefinitionName = (
    projectUuid: string,
    options: RefreshOptions = {},
) => {
    const { showToast = true } = options;
    const { t } = useTranslation('app');
    const { showToastApiError } = useToaster();
    const { registerJobs } = useSchedulerJobsContext();
    const queryClient = useQueryClient();

    return useMutation<{ jobIds: string[] }, ApiError, string>(
        (preAggregateDefinitionName) =>
            refreshPreAggregateByDefinitionName(
                projectUuid,
                preAggregateDefinitionName,
            ),
        {
            mutationKey: ['refreshPreAggregateByDefinitionName', projectUuid],
            onSuccess: (data, preAggregateDefinitionName) => {
                // Immediately refetch so the table shows in_progress status
                void queryClient.invalidateQueries({
                    queryKey: ['preAggregateMaterializations', projectUuid],
                });
                registerJobs({
                    jobIds: data.jobIds,
                    label: preAggregateDefinitionName,
                    showToast,
                    toastKey: 'pre-aggregate-rebuild',
                    toastTitle: t('usePreAggregateRefresh.rebuildingOne'),
                    toastIcon: IconRefreshDot,
                    onComplete: () => {
                        void queryClient.invalidateQueries({
                            queryKey: [
                                'preAggregateMaterializations',
                                projectUuid,
                            ],
                        });
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'usePreAggregateRefresh.failedToRebuildPreAggregate',
                    ),
                    apiError: error,
                });
            },
        },
    );
};
