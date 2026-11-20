import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getHandledAgentToolCallIds } from '../streaming/handledAgentToolCalls';
import { useAiAgentProjectFinalToolCalls } from '../streaming/useAiAgentThreadStreamQuery';

export const useRefreshSavedChartOnAgentEdit = ({
    projectUuid,
    chartUuid,
    chartSlug,
}: {
    projectUuid: string | undefined;
    chartUuid: string | undefined;
    chartSlug: string | undefined;
}) => {
    const queryClient = useQueryClient();
    const toolCalls = useAiAgentProjectFinalToolCalls(projectUuid);

    useEffect(() => {
        if (!projectUuid || !chartUuid) return;
        const handledToolCallIds = getHandledAgentToolCallIds('savedChart');

        for (const part of toolCalls) {
            if (
                part.toolName !== 'editContent' ||
                part.toolArgs.type !== 'chart' ||
                part.toolResult?.metadata.status !== 'success' ||
                part.toolResult.metadata.uuid !== chartUuid ||
                handledToolCallIds.has(part.toolCallId)
            ) {
                continue;
            }
            handledToolCallIds.add(part.toolCallId);

            const identifiers = new Set([
                chartUuid,
                chartSlug,
                part.toolArgs.slug,
                part.toolResult.metadata.slug,
            ]);
            for (const identifier of identifiers) {
                if (!identifier) continue;
                void queryClient.invalidateQueries({
                    queryKey: ['saved_query', identifier, projectUuid],
                });
            }
        }
    }, [toolCalls, projectUuid, chartUuid, chartSlug, queryClient]);
};
