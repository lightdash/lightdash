import { Image, Stack, Title } from '@mantine-8/core';
import { useParams } from 'react-router';
import { FadeTransition } from '../../../components/FadeTransition';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { useStartAgentThreadMutation } from '../../features/aiCopilot/hooks/useAiAgents';

const AiAgentNewThreadPage = () => {
    const { agentUuid } = useParams();
    const { mutateAsync: startAgentThread, isLoading } =
        useStartAgentThreadMutation(agentUuid!);

    return (
        <Stack
            justify="space-between"
            gap={0}
            pos="relative"
            {...ChatElementsUtils.centeredElementProps}
        >
            <FadeTransition>
                {(styles) => (
                    <Image
                        src={
                            'https://cdn.prod.website-files.com/62a9ae93cf7542032ae55b9c/678fb22fa7253e8363552974_road_bg-p-1600.png'
                        }
                        pos="absolute"
                        bottom={0}
                        left={0}
                        right={0}
                        style={{
                            ...styles,
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </FadeTransition>
            <Stack flex={1} py="xl" justify="flex-end">
                <Title order={3} ta="center" c="dimmed">
                    How can I help you?
                </Title>

                <AgentChatInput
                    onSubmit={(prompt) => {
                        void startAgentThread({ prompt });
                    }}
                    loading={isLoading}
                />
            </Stack>
        </Stack>
    );
};
export default AiAgentNewThreadPage;
