import {
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import {
    useCreateAgentThreadMessageMutation,
    useProjectAiAgents,
} from '../../hooks/useProjectAiAgents';
import { useRefreshDocumentOnAgentSave } from '../../hooks/useRefreshDocumentOnAgentSave';
import { selectThreadSqlMode } from '../../store/aiAgentThreadModeSlice';
import { useAiAgentStoreSelector } from '../../store/hooks';
import { keepAgentThreadQuiet } from '../../streaming/quietAgentThreads';

export type BubbleThreadPostInput = {
    prompt: string;
    toolHints: string[];
    context: AiPromptContextInput | undefined;
    optimisticContext: AiPromptContext | undefined;
};

/**
 * Posts a message to a bubble's conversation. What the agent then saves shows
 * on the page without moving it, the same for a typed reply and one with marks.
 */
export const useBubbleThreadPost = (
    projectUuid: string,
    agentUuid: string,
    threadId: string,
) => {
    // Other bubbles may be in use: this one's agent never scrolls the page.
    useEffect(() => keepAgentThreadQuiet(threadId), [threadId]);
    // The agents list never redirects on a refusal; the single-agent query does.
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const agent = useMemo(
        () => agents?.find((a) => a.uuid === agentUuid) ?? null,
        [agents, agentUuid],
    );

    // A dashboard made elsewhere is linked in the reply: the page stays put.
    const handleToolResult = useRefreshDocumentOnAgentSave(projectUuid);

    const { mutateAsync: createMessage, isLoading: isPosting } =
        useCreateAgentThreadMessageMutation(projectUuid, agentUuid, threadId, {
            onToolResult: handleToolResult,
        });

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    const sqlMode = useAiAgentStoreSelector(
        selectThreadSqlMode(threadId, agent?.enableSqlMode),
    );

    const post = useCallback(
        ({
            prompt,
            toolHints,
            context,
            optimisticContext,
        }: BubbleThreadPostInput) =>
            createMessage({
                prompt,
                context,
                optimisticContext,
                enableSqlMode: sqlModeAvailable && sqlMode,
                toolHints,
            }),
        [createMessage, sqlMode, sqlModeAvailable],
    );

    return { agent, post, isPosting };
};
