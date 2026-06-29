import {
    type AiSchedulerConfig,
    type ApiAiSchedulerConfigResponse,
    type ApiError,
    type ApiSuccessEmpty,
    type UpsertAiSchedulerConfig,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const AI_CONFIG_KEY = 'ai_scheduler_config';

const getAiSchedulerConfig = (schedulerUuid: string) =>
    lightdashApi<ApiAiSchedulerConfigResponse['results']>({
        url: `/schedulers/${schedulerUuid}/ai-config`,
        method: 'GET',
        body: undefined,
    });

export const useAiSchedulerConfig = (schedulerUuid: string | undefined) =>
    useQuery<AiSchedulerConfig | null, ApiError>({
        queryKey: [AI_CONFIG_KEY, schedulerUuid],
        queryFn: () => getAiSchedulerConfig(schedulerUuid!),
        enabled: !!schedulerUuid,
    });

export const AI_SCHEDULER_CONFIG_KEY = AI_CONFIG_KEY;

export const upsertAiSchedulerConfig = (
    schedulerUuid: string,
    data: UpsertAiSchedulerConfig,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/schedulers/${schedulerUuid}/ai-config`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const deleteAiSchedulerConfig = (schedulerUuid: string) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/schedulers/${schedulerUuid}/ai-config`,
        method: 'DELETE',
        body: undefined,
    });
