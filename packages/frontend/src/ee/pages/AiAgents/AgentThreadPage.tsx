import { Center, Loader } from '@mantine-8/core';
import { useEffect, useRef } from 'react';
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
    const lastStreamingStopTimeRef = useRef<number>(0);
    const STREAMING_COOLDOWN_MS = 3000; // 3 second cooldown after streaming stops

    // Track when streaming stops to prevent immediate polling restart
    useEffect(() => {
        if (!isStreaming && lastStreamingStopTimeRef.current === 0) {
            // Streaming just stopped
            lastStreamingStopTimeRef.current = Date.now();
        } else if (isStreaming) {
            // Reset when streaming starts again
            lastStreamingStopTimeRef.current = 0;
        }
    }, [isStreaming]);

    useEffect(() => {
        if (!isPending) return;
        if (isStreaming) return;

        // Prevent polling from starting immediately after streaming completes
        const timeSinceStreamingStopped =
            Date.now() - lastStreamingStopTimeRef.current;
        if (
            lastStreamingStopTimeRef.current > 0 &&
            timeSinceStreamingStopped < STREAMING_COOLDOWN_MS
        ) {
            // Schedule a single refetch after cooldown period
            const cooldownTimer = setTimeout(() => {
                void refetch();
            }, STREAMING_COOLDOWN_MS - timeSinceStreamingStopped);

            return () => clearTimeout(cooldownTimer);
        }

        const interval = setInterval(() => {
            void refetch();
        }, 2000);

        return () => clearInterval(interval);
    }, [isPending, refetch, isStreaming]);

    const handleSubmit = (prompt: string) => {
        void createAgentThreadMessage({ prompt });
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
