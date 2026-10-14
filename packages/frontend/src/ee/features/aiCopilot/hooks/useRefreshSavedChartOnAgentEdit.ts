import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAiAgentProjectStreamParts } from '../streaming/useAiAgentThreadStreamQuery';

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
    const parts = useAiAgentProjectStreamParts(projectUuid);
    const handledToolCallIds = useRef(new Set<string>());

    useEffect(() => {
        if (!projectUuid || !chartUuid) return;

        for (const part of parts) {
            if (
                part.type !== 'toolCall' ||
                part.toolName !== 'editContent' ||
                part.toolArgs.type !== 'chart' ||
                part.isPreliminary !== false ||
                part.toolResult?.metadata.status !== 'success' ||
                part.toolResult.metadata.uuid !== chartUuid ||
                handledToolCallIds.current.has(part.toolCallId)
            ) {
                continue;
            }
            handledToolCallIds.current.add(part.toolCallId);

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
    }, [parts, projectUuid, chartUuid, chartSlug, queryClient]);
};
