import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getHandledAgentToolCallIds } from '../streaming/handledAgentToolCalls';
import { useAiAgentProjectStreamParts } from '../streaming/useAiAgentThreadStreamQuery';

/** Reloads the composer chart page, silently, after the agent successfully edits this chart. */
export const useRefreshComposerChartOnAgentEdit = ({
    projectUuid,
    composerChartUuid,
}: {
    projectUuid: string;
    composerChartUuid: string;
}) => {
    const queryClient = useQueryClient();
    const parts = useAiAgentProjectStreamParts(projectUuid);

    useEffect(() => {
        const handledToolCallIds = getHandledAgentToolCallIds('composerChart');
        const edits = parts.filter(
            (part) =>
                part.type === 'toolCall' &&
                part.toolName === 'editContent' &&
                part.toolArgs.type === 'composer_chart' &&
                part.isPreliminary === false &&
                part.toolResult?.metadata.status === 'success' &&
                part.toolResult.metadata.uuid === composerChartUuid &&
                !handledToolCallIds.has(part.toolCallId),
        );
        if (edits.length === 0) return;
        for (const edit of edits) {
            if (edit.type === 'toolCall')
                handledToolCallIds.add(edit.toolCallId);
        }
        // The page's run and parameters are keyed by version, so a new version reruns them
        void queryClient.invalidateQueries({
            queryKey: ['composerChart', projectUuid],
        });
    }, [parts, projectUuid, composerChartUuid, queryClient]);
};
