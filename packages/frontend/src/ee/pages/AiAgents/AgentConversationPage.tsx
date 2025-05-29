import {
    Avatar,
    Badge,
    Card,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import { useLayoutEffect, useRef, type FC } from 'react';
import { useParams } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { getNameInitials } from '../../../features/comments/utils';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { AgentChatInput } from '../../features/aiCopilot/components/AgentChatInput';
import {
    useAiAgentThread,
    useGenerateAgentThreadResponseMutation,
} from '../../features/aiCopilot/hooks/useAiAgents';

// TODO:: this type should be removed in favor of existing types
type AiThreadMessageProps = {
    actor: 'user' | 'assistant';
    initials: string;
    message: string;
    messagedAt: Date;
    humanScore?: number;
};

// TODO :: rename this component to AiAgentThreadMessage, extract as a separate file
const AiThreadMessage: FC<AiThreadMessageProps> = ({
    actor,
    initials,
    message,
    messagedAt,
    humanScore,
}) => {
    const timeAgo = useTimeAgo(messagedAt);

    return (
        <Group
            maw="70%"
            align="flex-start"
            gap="sm"
            style={{
                marginLeft: actor === 'user' ? 'auto' : undefined,
                flexDirection: actor === 'user' ? 'row-reverse' : 'row',
            }}
        >
            <Avatar
                color={actor === 'user' ? 'violet' : 'gray.3'}
                radius="xl"
                variant="filled"
            >
                {initials}
            </Avatar>

            <Stack
                gap="xs"
                align={actor === 'user' ? 'flex-end' : 'flex-start'}
            >
                <Tooltip label={dayjs(messagedAt).toString()} withinPortal>
                    <Text size="xs" c="dimmed">
                        {timeAgo}
                    </Text>
                </Tooltip>

                <Card
                    pos="relative"
                    shadow="md"
                    radius="xl"
                    py="sm"
                    px="lg"
                    bg={actor === 'assistant' ? 'white' : 'blue.1'}
                    color={actor === 'assistant' ? 'black' : 'white'}
                    style={{
                        overflow: 'unset',
                        ...(actor === 'assistant'
                            ? { borderStartStartRadius: '0px' }
                            : actor === 'user'
                            ? { borderStartEndRadius: '0px' }
                            : {}),
                    }}
                >
                    {message ? (
                        <MDEditor.Markdown
                            source={message}
                            style={{ backgroundColor: 'transparent' }}
                        />
                    ) : (
                        <Text c="dimmed">No response yet</Text>
                    )}

                    {actor === 'assistant' && humanScore !== undefined && (
                        <Badge
                            pos="absolute"
                            right={10}
                            bottom={-14}
                            variant="filled"
                            size="lg"
                            fz="lg"
                            bg={
                                humanScore === 1
                                    ? 'green.7'
                                    : humanScore === -1
                                    ? 'red.7'
                                    : undefined
                            }
                        >
                            {humanScore === 1
                                ? '👍'
                                : humanScore === -1
                                ? '👎'
                                : undefined}
                        </Badge>
                    )}
                </Card>
            </Stack>
        </Group>
    );
};

// TODO :: rename this component to AiAgentThreadPage
const AgentConversationPage = () => {
    const { agentUuid, threadUuid } = useParams();
    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        agentUuid!,
        threadUuid!,
    );

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

    if (isLoadingThread || !thread) {
        return <PageSpinner />;
    }

    return (
        <Stack h="100%" mah="100%" justify="space-between" gap={0}>
            <Stack
                flex={1}
                style={{ overflowY: 'auto' }}
                p="md"
                ref={scrollRef}
            >
                {thread.messages.map((message) => (
                    <AiThreadMessage
                        // TODO:: this is needed because of ai_prompt mapping
                        key={`${message.uuid}-${message.role}`}
                        actor={message.role}
                        initials={
                            message.role === 'user'
                                ? getNameInitials(message.user.name)
                                : 'A'
                        }
                        message={message.message}
                        messagedAt={new Date(message.createdAt)}
                    />
                ))}
            </Stack>
            <AgentChatInput
                disabled={thread.createdFrom === 'slack'}
                loading={isGenerating}
                onSubmit={(prompt) => {
                    void generateAgentThreadResponse({ prompt });
                }}
            />
        </Stack>
    );
};

export default AgentConversationPage;
