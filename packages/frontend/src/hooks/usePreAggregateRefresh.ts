import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const refreshAllPreAggregates = async (projectUuid: string) =>
    lightdashApi<{ jobIds: string[] }>({
        url: `/projects/${projectUuid}/pre-aggregates/refresh`,
        method: 'POST',
        body: undefined,
    });

const refreshPreAggregateByName = async (
    projectUuid: string,
    preAggExploreName: string,
) =>
    lightdashApi<{ jobIds: string[] }>({
        url: `/projects/${projectUuid}/pre-aggregates/${encodeURIComponent(preAggExploreName)}/refresh`,
        method: 'POST',
        body: undefined,
    });

export const useRefreshAllPreAggregates = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<{ jobIds: string[] }, ApiError>(
        () => refreshAllPreAggregates(projectUuid),
        {
            mutationKey: ['refreshAllPreAggregates', projectUuid],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Pre-aggregate refresh started',
                    subtitle:
                        'All pre-aggregates are being refreshed in the background.',
                });
                await queryClient.invalidateQueries([
                    'preAggregateMaterializations',
                    projectUuid,
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to refresh pre-aggregates',
                    apiError: error,
                });
            },
        },
    );
};

export const useRefreshPreAggregateByName = (projectUuid: string) => {
    const { showToastApiError, showToastInfo } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<{ jobIds: string[] }, ApiError, string>(
        (preAggExploreName) =>
            refreshPreAggregateByName(projectUuid, preAggExploreName),
        {
            mutationKey: ['refreshPreAggregate', projectUuid],
            onSuccess: async () => {
                showToastInfo({
                    title: 'Pre-aggregate refresh started',
                    subtitle:
                        'The pre-aggregate is being refreshed in the background.',
                });
                await queryClient.invalidateQueries([
                    'preAggregateMaterializations',
                    projectUuid,
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to refresh pre-aggregate',
                    apiError: error,
                });
            },
        },
    );
};
