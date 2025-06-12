import { Box, Center, Loader, Stack } from '@mantine-8/core';
import { useOutletContext, useParams } from 'react-router';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import {
    useAiAgent,
    useAiAgentThread,
    useGenerateAgentThreadResponseMutation,
} from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
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
        mutateAsync: generateAgentThreadResponse,
        isLoading: isGenerating,
    } = useGenerateAgentThreadResponseMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );

    const handleSubmit = (prompt: string) => {
        void generateAgentThreadResponse({ prompt });
    };

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <Stack h="100%" justify="space-between" py="xl">
            <AgentChatDisplay
                thread={thread}
                agentName={agentQuery.data?.name ?? 'AI'}
                enableAutoScroll={true}
                isGenerating={isGenerating}
            />
            <Box
                {...ChatElementsUtils.centeredElementProps}
                pos="sticky"
                bottom={0}
                h="auto"
            >
                <AgentChatInput
                    disabled={
                        thread.createdFrom === 'slack' ||
                        !isThreadFromCurrentUser
                    }
                    disabledReason="This thread is read-only. To continue the conversation, reply in Slack."
                    loading={isGenerating}
                    onSubmit={handleSubmit}
                    placeholder={`Ask ${agent.name} anything about your data...`}
                />
            </Box>
        </Stack>
    );
};

export default AiAgentThreadPage;
