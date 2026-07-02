import {
    type ApiError,
    type ApiSchedulerAiAugmentationResponse,
    type SchedulerAiAugmentation,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getSchedulerAiAugmentation = (schedulerUuid: string) =>
    lightdashApi<ApiSchedulerAiAugmentationResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'GET',
        body: undefined,
    });

export const useSchedulerAiAugmentation = (schedulerUuid: string | undefined) =>
    useQuery<SchedulerAiAugmentation | null, ApiError>({
        queryKey: ['scheduler_ai_augmentation', schedulerUuid],
        queryFn: () => getSchedulerAiAugmentation(schedulerUuid!),
        enabled: !!schedulerUuid,
    });

// Called imperatively as the second step of the scheduler save, once the
// scheduler (and therefore its uuid) exists.
export const upsertSchedulerAiAugmentation = (
    schedulerUuid: string,
    augmentation: SchedulerAiAugmentation,
) =>
    lightdashApi<ApiSchedulerAiAugmentationResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'PUT',
        body: JSON.stringify(augmentation),
    });

export const deleteSchedulerAiAugmentation = (schedulerUuid: string) =>
    lightdashApi<undefined>({
        url: `/schedulers/${schedulerUuid}/ai-augmentation`,
        method: 'DELETE',
        body: undefined,
    });
