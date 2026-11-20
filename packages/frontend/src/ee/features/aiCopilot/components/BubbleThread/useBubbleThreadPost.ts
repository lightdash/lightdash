import {
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useOptionalProjectRoute } from '../../../../../hooks/useProjectRoute';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import {
    useCreateAgentThreadMessageMutation,
    useProjectAiAgents,
} from '../../hooks/useProjectAiAgents';
import { useRefreshDocumentOnAgentSave } from '../../hooks/useRefreshDocumentOnAgentSave';
import { selectThreadSqlMode } from '../../store/aiAgentThreadModeSlice';
import { useAiAgentStoreSelector } from '../../store/hooks';
import { type AiAgentToolResult } from '../../types';
import { getDashboardNavigationUrlFromContentToolResult } from '../../utils/contentToolResultNavigation';

export type BubbleThreadPostInput = {
    prompt: string;
    toolHints: string[];
    context: AiPromptContextInput | undefined;
    optimisticContext: AiPromptContext | undefined;
};

/**
 * Posts a message to a bubble's conversation. What the agent then saves shows
 * on the page, the same for a typed reply and for a reply with marks.
 */
export const useBubbleThreadPost = (
    projectUuid: string,
    agentUuid: string,
    threadId: string,
) => {
    const navigate = useNavigate();
    // The agents list never redirects on a refusal; the single-agent query does.
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const agent = useMemo(
        () => agents?.find((a) => a.uuid === agentUuid) ?? null,
        [agents, agentUuid],
    );

    const refreshDocumentOnAgentSave =
        useRefreshDocumentOnAgentSave(projectUuid);
    const projectSlug = useOptionalProjectRoute()?.project.slug ?? null;
    const handleToolResult = useCallback(
        (toolResult: AiAgentToolResult) => {
            refreshDocumentOnAgentSave(toolResult);
            // Null when the agent edited the dashboard that is already open.
            const dashboardUrl = getDashboardNavigationUrlFromContentToolResult(
                { projectUuid, projectSlug },
                toolResult,
            );
            if (!dashboardUrl) return;

            void navigate(dashboardUrl, { viewTransition: true });
        },
        [navigate, projectSlug, projectUuid, refreshDocumentOnAgentSave],
    );

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
