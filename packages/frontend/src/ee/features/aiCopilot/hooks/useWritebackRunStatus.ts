import {
    isAiWritebackRunInProgress,
    type AiWritebackRunStatusResult,
    type ApiError,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const POLL_INTERVAL_MS = 3_000;

/** The stage a background dbt change has reached; polled until the run ends or the read fails. */
export const useWritebackRunStatus = (
    projectUuid: string,
    aiWritebackRunUuid: string | null,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const query = useQuery<AiWritebackRunStatusResult, ApiError>({
        queryKey: ['aiWritebackRunStatus', projectUuid, aiWritebackRunUuid],
        queryFn: () =>
            lightdashApi<AiWritebackRunStatusResult>({
                version: 'v1',
                url: `/ee/projects/${projectUuid}/ai-writeback/status/${aiWritebackRunUuid}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: !!aiWritebackRunUuid,
        retry: false,
        refetchInterval: (data, { state }) =>
            state.status !== 'error' &&
            (!data || isAiWritebackRunInProgress(data.status))
                ? POLL_INTERVAL_MS
                : false,
    });
    const hasEnded =
        !!query.data && !isAiWritebackRunInProgress(query.data.status);
    // The thread stops refetching on its own after a few minutes, so a long run would never show its result.
    useEffect(() => {
        if (hasEnded) {
            void queryClient.invalidateQueries({
                queryKey: ['aiAgents', projectUuid],
            });
        }
    }, [hasEnded, projectUuid, queryClient]);
    return query;
};
