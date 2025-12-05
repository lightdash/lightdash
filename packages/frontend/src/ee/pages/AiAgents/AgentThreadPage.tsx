import { Center, Loader } from '@mantine-8/core';
import { useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentThreadArtifact } from '../../features/aiCopilot/hooks/useAiAgentThreadArtifact';
import {
    useProjectAiAgent as useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useAiAgentThreadStreaming } from '../../features/aiCopilot/streaming/useAiAgentThreadStreamQuery';
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
    const { agent } = useOutletContext<AgentContext>();

    const canManage = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuid,
    );
    const isPending = thread?.messages?.some(
        (message) =>
            message.role === 'assistant' && message.status === 'pending',
    );

    const isStreaming = useAiAgentThreadStreaming(threadUuid!);

    useEffect(() => {
        if (!isPending) return;
        if (isStreaming) return;

        const interval = setInterval(() => {
            void refetch();
        }, 2000);

        return () => clearInterval(interval);
    }, [isPending, refetch, isStreaming]);

    const handleSubmit = (prompt: string) => {
        // Use modelConfig from first assistant message for follow-up messages
        const firstAssistantMessage = thread?.messages?.find(
            (m) => m.role === 'assistant',
        );
        const modelConfig = firstAssistantMessage?.modelConfig ?? undefined;

        void createAgentThreadMessage({ prompt, modelConfig });
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
        >
            <AgentChatInput
                disabled={
                    thread.createdFrom === 'slack' || !isThreadFromCurrentUser
                }
                disabledReason="This thread is read-only. To continue the conversation, reply in Slack."
                loading={isCreatingMessage || isStreaming || isPending}
                onSubmit={handleSubmit}
                placeholder={`Ask ${agent.name} anything about your data...`}
                messageCount={thread.messages?.length || 0}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
            />
        </AgentChatDisplay>
    );
};

export default AiAgentThreadPage;
