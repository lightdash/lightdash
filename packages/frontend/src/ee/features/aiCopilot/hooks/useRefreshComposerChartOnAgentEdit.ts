import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getHandledAgentToolCallIds } from '../streaming/handledAgentToolCalls';
import { useAiAgentContentEdits } from '../streaming/useAiAgentThreadStreamQuery';

/** Reloads the composer chart page, silently, after the agent successfully edits this chart. */
export const useRefreshComposerChartOnAgentEdit = ({
    projectUuid,
    composerChartUuid,
}: {
    projectUuid: string;
    composerChartUuid: string;
}) => {
    const queryClient = useQueryClient();
    const edits = useAiAgentContentEdits({
        projectUuid,
        contentType: 'composer_chart',
        contentUuid: composerChartUuid,
    });

    useEffect(() => {
        const handledToolCallIds = getHandledAgentToolCallIds('composerChart');
        const newEdits = edits.filter(
            (edit) => !handledToolCallIds.has(edit.toolCallId),
        );
        if (newEdits.length === 0) return;
        for (const edit of newEdits) handledToolCallIds.add(edit.toolCallId);
        // The page's run and parameters are keyed by version, so a new version reruns them
        void queryClient.invalidateQueries({
            queryKey: ['composerChart', projectUuid],
        });
    }, [edits, projectUuid, queryClient]);
};
