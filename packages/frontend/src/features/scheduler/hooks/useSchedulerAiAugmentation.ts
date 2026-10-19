import {
    type ApiError,
    type ApiSchedulerAiAugmentationResponse,
    type SchedulerAiAugmentation,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getSchedulerAiAugmentation = (
    lightdashApi: LightdashApi,
    schedulerUuid: string,
) =>
    lightdashApi<ApiSchedulerAiAugmentationResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'GET',
        body: undefined,
    });

export const useSchedulerAiAugmentation = (
    schedulerUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<SchedulerAiAugmentation | null, ApiError>({
        queryKey: ['scheduler_ai_augmentation', schedulerUuid],
        queryFn: () => getSchedulerAiAugmentation(lightdashApi, schedulerUuid!),
        enabled: !!schedulerUuid && enabled,
    });
};

const upsertSchedulerAiAugmentation = (
    lightdashApi: LightdashApi,
    schedulerUuid: string,
    augmentation: SchedulerAiAugmentation,
) =>
    lightdashApi<ApiSchedulerAiAugmentationResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'PUT',
        body: JSON.stringify(augmentation),
    });

export const useSchedulerAiAugmentationUpsertMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        SchedulerAiAugmentation | null,
        ApiError,
        { schedulerUuid: string; augmentation: SchedulerAiAugmentation }
    >(
        ({ schedulerUuid, augmentation }) =>
            upsertSchedulerAiAugmentation(
                lightdashApi,
                schedulerUuid,
                augmentation,
            ),
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

const deleteSchedulerAiAugmentation = (
    lightdashApi: LightdashApi,
    schedulerUuid: string,
) =>
    lightdashApi<undefined>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'DELETE',
        body: undefined,
    });

export const useSchedulerAiAugmentationDeleteMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, { schedulerUuid: string }>(
        ({ schedulerUuid }) =>
            deleteSchedulerAiAugmentation(lightdashApi, schedulerUuid),
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
