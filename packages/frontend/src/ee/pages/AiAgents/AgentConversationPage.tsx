import {
    assertUnreachable,
    type AiAgentMessage,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import {
    Avatar,
    Badge,
    Card,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import EChartsReact from 'echarts-for-react';
import {
    useLayoutEffect,
    useRef,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useParams } from 'react-router';
import { getNameInitials } from '../../../features/comments/utils';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { AgentChatInput } from '../../features/aiCopilot/components/AgentChatInput';
import {
    useAiAgentThread,
    useAiAgentThreadMessageViz,
    useGenerateAgentThreadResponseMutation,
} from '../../features/aiCopilot/hooks/useAiAgents';
import AiTableViz from './AiTableViz';

type MessageBubbleProps = {
    message: AiAgentMessage;
};

const MessageBubble: FC<PropsWithChildren<MessageBubbleProps>> = ({
    children,
    message,
}) => {
    return (
        <Card
            pos="relative"
            shadow="md"
            radius="xl"
            py="sm"
            px="lg"
            bg={message.role === 'assistant' ? 'white' : 'blue.1'}
            color={message.role === 'assistant' ? 'black' : 'white'}
            style={{
                overflow: 'unset',
                ...(message.role === 'assistant'
                    ? { borderStartStartRadius: '0px' }
                    : message.role === 'user'
                    ? { borderStartEndRadius: '0px' }
                    : {}),
            }}
        >
            {children}
        </Card>
    );
};

type AiResultMessageProps = {
    message: AiAgentMessageAssistant;
};

const AiResultMessage: FC<AiResultMessageProps> = ({ message }) => {
    const { agentUuid } = useParams();
    const { activeProjectUuid } = useActiveProjectUuid();

    const vizQuery = useAiAgentThreadMessageViz(
        {
            agentUuid: agentUuid!,
            threadUuid: message.threadUuid,
            messageUuid: message.uuid,
        },
        {
            enabled:
                !!message.metricQuery &&
                !!message.vizConfigOutput &&
                !!activeProjectUuid,
        },
    );

    return (
        <MessageBubble message={message}>
            {vizQuery.isLoading ? (
                <Loader />
            ) : vizQuery.isError ? (
                <Text>Error fetching viz</Text>
            ) : vizQuery.data.type === 'vertical_bar_chart' ? (
                <EChartsReact option={vizQuery.data.chartOptions} />
            ) : vizQuery.data.type === 'time_series_chart' ? (
                <EChartsReact option={vizQuery.data.chartOptions} />
            ) : vizQuery.data.type === 'csv' ? (
                <AiTableViz results={vizQuery.data.results} />
            ) : (
                assertUnreachable(vizQuery.data.type, 'Unknown viz type')
            )}
        </MessageBubble>
    );
};

type AiThreadMessageProps = {
    message: AiAgentMessage;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({ message }) => {
    const initials =
        message.role === 'user' ? getNameInitials(message.user.name) : 'AI';

    const timeAgo = useTimeAgo(new Date(message.createdAt));

    return (
        <>
            <Group
                maw="70%"
                align="flex-start"
                gap="sm"
                style={{
                    marginLeft: message.role === 'user' ? 'auto' : undefined,
                    flexDirection:
                        message.role === 'user' ? 'row-reverse' : 'row',
                }}
            >
                <Avatar
                    color={message.role === 'user' ? 'violet' : 'gray.3'}
                    radius="xl"
                    variant="filled"
                >
                    {initials}
                </Avatar>

                <Stack
                    gap="xs"
                    align={message.role === 'user' ? 'flex-end' : 'flex-start'}
                >
                    <Tooltip
                        label={dayjs(message.createdAt).toString()}
                        withinPortal
                    >
                        <Text size="xs" c="dimmed">
                            {timeAgo}
                        </Text>
                    </Tooltip>

                    <MessageBubble message={message}>
                        {message ? (
                            <MDEditor.Markdown
                                source={message.message}
                                style={{ backgroundColor: 'transparent' }}
                            />
                        ) : (
                            <Text c="dimmed">No response yet</Text>
                        )}

                        {message.role === 'assistant' &&
                            typeof message.humanScore === 'number' && (
                                <Badge
                                    pos="absolute"
                                    right={10}
                                    bottom={-14}
                                    variant="filled"
                                    size="lg"
                                    fz="lg"
                                    bg={
                                        message.humanScore === 1
                                            ? 'green.7'
                                            : message.humanScore === -1
                                            ? 'red.7'
                                            : undefined
                                    }
                                >
                                    {message.humanScore === 1
                                        ? '👍'
                                        : message.humanScore === -1
                                        ? '👎'
                                        : undefined}
                                </Badge>
                            )}
                    </MessageBubble>
                </Stack>
            </Group>

            {message.role === 'assistant' &&
                message.vizConfigOutput &&
                message.metricQuery && <AiResultMessage message={message} />}
        </>
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
        return <Loader />;
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
                        key={`${message.role}-${message.uuid}`}
                        message={message}
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
