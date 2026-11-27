import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { COMPOSER_CHART_PAGE_QUERY_KEYS } from '../../../../features/composerCharts/hooks/useComposerChartPage';
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
        for (const key of COMPOSER_CHART_PAGE_QUERY_KEYS) {
            void queryClient.invalidateQueries({
                queryKey: [key, projectUuid],
            });
        }
    }, [parts, projectUuid, composerChartUuid, queryClient]);
};
