import { type AiAgentThread } from '@lightdash/common';
import { Center, Loader } from '@mantine-8/core';
import { useOutletContext, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import {
    useProjectAiAgent as useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useAiAgentPageLayout } from '../../features/aiCopilot/providers/AiLayoutProvider';
import { useAiAgentThreadStreaming } from '../../features/aiCopilot/streaming/useAiAgentThreadStreamQuery';
import { type AgentContext } from './AgentPage';

const AiAgentThreadPage = ({ debug }: { debug?: boolean }) => {
    const { agentUuid, threadUuid, projectUuid, promptUuid } = useParams();
    const { user } = useApp();
    const { setArtifact, artifact } = useAiAgentPageLayout();

    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        projectUuid!,
        agentUuid,
        threadUuid,
        {
            onSuccess: (threadData: AiAgentThread) => {
                if (!threadData?.messages?.length) return;

                const lastMessage = threadData.messages.at(-1);
                if (!lastMessage || lastMessage.role !== 'assistant') return;

                const messageArtifact = lastMessage.artifact;
                if (!messageArtifact) return;

                // Only auto-open if no artifact is currently set or it's different
                if (
                    artifact?.artifactUuid !== messageArtifact.uuid ||
                    artifact?.versionUuid !== messageArtifact.versionUuid
                ) {
                    setArtifact(
                        messageArtifact.uuid,
                        messageArtifact.versionUuid,
                        lastMessage,
                        projectUuid!,
                        agentUuid!,
                    );
                }
            },
        },
    );

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const agentQuery = useAiAgent(projectUuid!, agentUuid!);
    const { agent } = useOutletContext<AgentContext>();

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuid,
    );
    const isStreaming = useAiAgentThreadStreaming(threadUuid!);

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
        >
            <AgentChatInput
                disabled={
                    thread.createdFrom === 'slack' || !isThreadFromCurrentUser
                }
                disabledReason="This thread is read-only. To continue the conversation, reply in Slack."
                loading={isCreatingMessage || isStreaming}
                onSubmit={handleSubmit}
                placeholder={`Ask ${agent.name} anything about your data...`}
            />
        </AgentChatDisplay>
    );
};

export default AiAgentThreadPage;
