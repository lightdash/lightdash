import { Center, Loader } from '@mantine-8/core';
import { useOutletContext, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import {
    useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import { useAiAgentThreadStreaming } from '../../features/aiCopilot/streaming/useAiAgentThreadStreamQuery';
import { type AgentContext } from './AgentPage';

const AiAgentThreadPage = () => {
    const { agentUuid, threadUuid, projectUuid } = useParams();
    const { user } = useApp();
    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        agentUuid,
        threadUuid,
    );

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const agentQuery = useAiAgent(agentUuid);
    const { agent } = useOutletContext<AgentContext>();

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(projectUuid, agentUuid, threadUuid);
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
            mode="interactive"
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
