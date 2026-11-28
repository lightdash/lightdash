import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getHandledAgentToolCallIds } from '../streaming/handledAgentToolCalls';
import { useAiAgentContentEdits } from '../streaming/useAiAgentThreadStreamQuery';

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
    const edits = useAiAgentContentEdits({
        projectUuid,
        contentType: 'chart',
        contentUuid: chartUuid,
    });

    useEffect(() => {
        if (!projectUuid || !chartUuid) return;
        const handledToolCallIds = getHandledAgentToolCallIds('savedChart');

        for (const edit of edits) {
            if (handledToolCallIds.has(edit.toolCallId)) continue;
            handledToolCallIds.add(edit.toolCallId);

            const identifiers = new Set([
                chartUuid,
                chartSlug,
                edit.toolArgs.slug,
                edit.toolResult?.metadata.status === 'success'
                    ? edit.toolResult.metadata.slug
                    : undefined,
            ]);
            for (const identifier of identifiers) {
                if (!identifier) continue;
                void queryClient.invalidateQueries({
                    queryKey: ['saved_query', identifier, projectUuid],
                });
            }
        }
    }, [edits, projectUuid, chartUuid, chartSlug, queryClient]);
};
