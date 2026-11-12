import {
    isAiWritebackRunInProgress,
    type AiWritebackRunStatusResult,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const POLL_INTERVAL_MS = 3_000;

/** The stage a background dbt change has reached; polled until the run ends. */
export const useWritebackRunStatus = (
    projectUuid: string,
    aiWritebackRunUuid: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AiWritebackRunStatusResult, ApiError>({
        queryKey: ['aiWritebackRunStatus', projectUuid, aiWritebackRunUuid],
        queryFn: () =>
            lightdashApi<AiWritebackRunStatusResult>({
                version: 'v1',
                url: `/ee/projects/${projectUuid}/ai-writeback/status/${aiWritebackRunUuid}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: !!aiWritebackRunUuid,
        refetchInterval: (data) =>
            !data || isAiWritebackRunInProgress(data.status)
                ? POLL_INTERVAL_MS
                : false,
    });
};
