import {
    type ApiError,
    type ApiSchedulerAiAugmentationResponse,
    type SchedulerAiAugmentation,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getSchedulerAiAugmentation = (schedulerUuid: string) =>
    lightdashApi<ApiSchedulerAiAugmentationResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'GET',
        body: undefined,
    });

export const useSchedulerAiAugmentation = (
    schedulerUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<SchedulerAiAugmentation | null, ApiError>({
        queryKey: ['scheduler_ai_augmentation', schedulerUuid],
        queryFn: () => getSchedulerAiAugmentation(schedulerUuid!),
        enabled: !!schedulerUuid && enabled,
    });

const upsertSchedulerAiAugmentation = (
    schedulerUuid: string,
    augmentation: SchedulerAiAugmentation,
) =>
    lightdashApi<ApiSchedulerAiAugmentationResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'PUT',
        body: JSON.stringify(augmentation),
    });

export const useSchedulerAiAugmentationUpsertMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<
        SchedulerAiAugmentation | null,
        ApiError,
        { schedulerUuid: string; augmentation: SchedulerAiAugmentation }
    >(
        ({ schedulerUuid, augmentation }) =>
            upsertSchedulerAiAugmentation(schedulerUuid, augmentation),
        {
            mutationKey: ['upsert_scheduler_ai_augmentation'],
            onSuccess: async (_data, { schedulerUuid }) => {
                await queryClient.invalidateQueries([
                    'scheduler_ai_augmentation',
                    schedulerUuid,
                ]);
            },
        },
    );
};

const deleteSchedulerAiAugmentation = (schedulerUuid: string) =>
    lightdashApi<undefined>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'DELETE',
        body: undefined,
    });

export const useSchedulerAiAugmentationDeleteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, { schedulerUuid: string }>(
        ({ schedulerUuid }) => deleteSchedulerAiAugmentation(schedulerUuid),
        {
            mutationKey: ['delete_scheduler_ai_augmentation'],
            onSuccess: async (_data, { schedulerUuid }) => {
                await queryClient.invalidateQueries([
                    'scheduler_ai_augmentation',
                    schedulerUuid,
                ]);
            },
        },
    );
};
