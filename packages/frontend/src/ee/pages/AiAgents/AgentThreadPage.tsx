import { type AiAgentMessage } from '@lightdash/common';
import { Divider, Loader, Stack } from '@mantine-8/core';
import { Fragment, useLayoutEffect, useRef, type FC } from 'react';
import { useParams } from 'react-router';
import {
    AssistantBubble,
    UserBubble,
} from '../../features/aiCopilot/components/ChatElements/AgentChatBubbles';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import {
    useAiAgent,
    useAiAgentThread,
    useGenerateAgentThreadResponseMutation,
} from '../../features/aiCopilot/hooks/useAiAgents';

type AiThreadMessageProps = {
    message: AiAgentMessage;
    agentName?: string;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({ message }) => {
    const isUser = message.role === 'user';

    return isUser ? (
        <UserBubble message={message} />
    ) : (
        <AssistantBubble message={message} />
    );
};

const AiAgentThreadPage = () => {
    const { agentUuid, threadUuid } = useParams();
    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        agentUuid!,
        threadUuid!,
    );

    const agentQuery = useAiAgent(agentUuid!);

    const {
        mutateAsync: generateAgentThreadResponse,
        isLoading: isGenerating,
    } = useGenerateAgentThreadResponseMutation(agentUuid!, threadUuid!);

    const scrollRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!scrollRef.current) return;

        // TODO :: debounce scrollTo
        scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [thread?.messages]);

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return <Loader />;
    }

    return (
        <Stack h="100%" mah="100%" justify="space-between" gap="lg" pb="xl">
            <Stack
                flex={1}
                style={{ overflowY: 'auto' }}
                py={30}
                ref={scrollRef}
                gap="xl"
            >
                {thread.messages.map((message, i, xs) => {
                    return (
                        <Fragment key={`${message.role}-${message.uuid}`}>
                            {ChatElementsUtils.shouldRenderDivider(
                                message,
                                i,
                                xs,
                            ) && (
                                <Divider
                                    label={ChatElementsUtils.getDividerLabel(
                                        message.createdAt,
                                    )}
                                    labelPosition="center"
                                    my="sm"
                                />
                            )}
                            <AiThreadMessage
                                message={message}
                                agentName={agentQuery.data?.name ?? 'AI'}
                            />
                        </Fragment>
                    );
                })}
            </Stack>

            <AgentChatInput
                disabled={thread.createdFrom === 'slack'}
                disabledReason="This thread is read-only. To continue the conversation, reply in Slack."
                loading={isGenerating}
                onSubmit={(prompt) => {
                    void generateAgentThreadResponse({ prompt });
                }}
            />
        </Stack>
    );
};

export default AiAgentThreadPage;
