import { Center, Loader } from '@mantine-8/core';
import { useCallback } from 'react';
import { useOutletContext, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useAiAgentThreadArtifact } from '../../features/aiCopilot/hooks/useAiAgentThreadArtifact';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import { usePendingThreadRefetch } from '../../features/aiCopilot/hooks/usePendingThreadRefetch';
import {
    useProjectAiAgent as useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import {
    selectThreadSqlMode,
    setThreadSqlMode,
} from '../../features/aiCopilot/store/aiAgentThreadModeSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../features/aiCopilot/store/hooks';
import { type AiAgentToolResult } from '../../features/aiCopilot/types';
import { getDashboardNavigationUrlFromContentToolResult } from '../../features/aiCopilot/utils/contentToolResultNavigation';
import { type AgentContext } from './AgentPage';

const AiAgentThreadPage = ({ debug }: { debug?: boolean }) => {
    const { agentUuid, threadUuid, projectUuid, promptUuid } = useParams();
    const { user } = useApp();

    const {
        data: thread,
        isLoading: isLoadingThread,
        refetch,
    } = useAiAgentThread(projectUuid!, agentUuid, threadUuid);

    // Handle artifact selection based on thread changes
    useAiAgentThreadArtifact({
        projectUuid,
        agentUuid,
        threadUuid,
        thread,
    });

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const agentQuery = useAiAgent(projectUuid!, agentUuid!);
    const { agent, navigateFromAgentChat } = useOutletContext<AgentContext>();

    const canManage = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const handleToolResult = useCallback(
        (toolResult: AiAgentToolResult) => {
            if (!projectUuid) return;

            const dashboardUrl = getDashboardNavigationUrlFromContentToolResult(
                projectUuid,
                toolResult,
            );
            if (!dashboardUrl) return;

            navigateFromAgentChat(dashboardUrl, {
                threadUuid,
                title: thread?.title || thread?.firstMessage?.message,
            });
        },
        [
            navigateFromAgentChat,
            projectUuid,
            thread?.firstMessage?.message,
            thread?.title,
            threadUuid,
        ],
    );

    const handleDashboardLinkClick = useCallback(
        (dashboardUrl: string) => {
            navigateFromAgentChat(dashboardUrl, {
                threadUuid,
                title: thread?.title || thread?.firstMessage?.message,
            });
        },
        [
            navigateFromAgentChat,
            thread?.firstMessage?.message,
            thread?.title,
            threadUuid,
        ],
    );

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuid,
        {
            onToolResult: handleToolResult,
        },
    );

    const { isStreaming, isPending } = usePendingThreadRefetch(
        thread,
        threadUuid!,
        refetch,
    );

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    const sqlMode = useAiAgentStoreSelector(
        selectThreadSqlMode(threadUuid ?? ''),
    );
    const dispatch = useAiAgentStoreDispatch();

    const firstAssistantMessage = thread?.messages?.find(
        (m) => m.role === 'assistant',
    );
    const threadModelConfig = firstAssistantMessage?.modelConfig ?? null;

    const { data: availableModels } = useModelOptions({
        projectUuid,
        agentUuid,
        options: { enabled: !!threadModelConfig },
    });

    const isThreadModelUnavailable =
        !!threadModelConfig &&
        !!availableModels &&
        !availableModels.some(
            (m) =>
                m.provider === threadModelConfig.modelProvider &&
                m.name === threadModelConfig.modelName,
        );

    const disabledReasons: { when: boolean; message: string }[] = [
        {
            when: thread?.createdFrom === 'slack',
            message:
                'This thread is read-only. To continue the conversation, reply in Slack.',
        },
        {
            when: !!thread && !isThreadFromCurrentUser,
            message: 'This thread is read-only. It belongs to another user.',
        },
        {
            when: isThreadModelUnavailable,
            message: `The model used in this thread (${threadModelConfig?.modelProvider} ${threadModelConfig?.modelName}) is no longer available. Start a new thread to continue.`,
        },
    ];
    const activeDisabledReason = disabledReasons.find((r) => r.when);
    const inputDisabled = !!activeDisabledReason;
    const inputDisabledReason = activeDisabledReason?.message;

    const handleSubmit = ({
        message,
        toolHints,
    }: {
        message: string;
        toolHints: string[];
    }) => {
        void createAgentThreadMessage({
            prompt: message,
            modelConfig: threadModelConfig ?? undefined,
            enableSqlMode: sqlModeAvailable && sqlMode,
            toolHints,
        });
    };

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agentQuery.data?.name ?? 'AI'}
            enableAutoScroll={true}
            promptUuid={promptUuid}
            debug={debug}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            showAddToEvalsButton={canManage}
            onDashboardLinkClick={handleDashboardLinkClick}
        >
            <AgentChatInput
                disabled={inputDisabled}
                disabledReason={inputDisabledReason}
                loading={isCreatingMessage || isStreaming || isPending}
                onSubmit={handleSubmit}
                placeholder={`Ask ${agent.name} anything about your data...`}
                messageCount={thread.messages?.length || 0}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                threadUuid={threadUuid}
                latestAssistantMessageUuid={
                    [...(thread.messages ?? [])]
                        .reverse()
                        .find((m) => m.role === 'assistant')?.uuid
                }
                sqlMode={sqlModeAvailable ? sqlMode : undefined}
                onSqlModeChange={
                    sqlModeAvailable && threadUuid
                        ? (enabled) =>
                              dispatch(
                                  setThreadSqlMode({
                                      threadUuid,
                                      enabled,
                                  }),
                              )
                        : undefined
                }
            />
        </AgentChatDisplay>
    );
};

export default AiAgentThreadPage;
