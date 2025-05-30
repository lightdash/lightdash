import { Stack, Text, Title } from '@mantine-8/core';
import { useParams } from 'react-router';
import { AgentChatInput } from '../../features/aiCopilot/components/AgentChatInput';
import { useStartAgentThreadMutation } from '../../features/aiCopilot/hooks/useAiAgents';

const AiAgentNewThreadPage = () => {
    const { agentUuid } = useParams();
    const { mutateAsync: startAgentThread, isLoading } =
        useStartAgentThreadMutation(agentUuid!);

    return (
        <Stack h="100%" mah="100%" justify="space-between" gap={0}>
            <Stack
                flex={1}
                style={{ overflowY: 'auto' }}
                p="md"
                justify="flex-end"
            >
                <Stack align="center" gap="xs">
                    {/* TODO:: COPY */}
                    <Title order={3}>New thread</Title>
                    <Text>
                        {/* TODO:: COPY */}
                        Start a new thread with your agent
                    </Text>
                </Stack>
            </Stack>
            <AgentChatInput
                onSubmit={(prompt) => {
                    void startAgentThread({ prompt });
                }}
                loading={isLoading}
            />
        </Stack>
    );
};
export default AiAgentNewThreadPage;
