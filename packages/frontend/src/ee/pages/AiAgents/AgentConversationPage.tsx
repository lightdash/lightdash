import {
    assertUnreachable,
    type AiAgentMessage,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import {
    Badge,
    Card,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
    type CardProps,
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
import { LightdashUserAvatar } from '../../../components/Avatar';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { AgentChatInput } from '../../features/aiCopilot/components/AgentChatInput';
import {
    useAiAgent,
    useAiAgentThread,
    useAiAgentThreadMessageViz,
    useGenerateAgentThreadResponseMutation,
} from '../../features/aiCopilot/hooks/useAiAgents';
import AiTableViz from './AiTableViz';

type MessageBubbleProps = {
    message: AiAgentMessage;
    cardProps?: CardProps;
};

const MessageBubble: FC<PropsWithChildren<MessageBubbleProps>> = ({
    children,
    message,
    cardProps,
}) => {
    return (
        <Card
            pos="relative"
            shadow="md"
            radius="xl"
            py="sm"
            px="lg"
            bg={message.role === 'assistant' ? 'white' : 'blue.2'}
            fw={message.role === 'user' ? 500 : undefined}
            color={message.role === 'assistant' ? 'black' : 'white'}
            style={{
                overflow: 'unset',
                ...(message.role === 'assistant'
                    ? { borderStartStartRadius: '0px' }
                    : message.role === 'user'
                    ? { borderStartEndRadius: '0px' }
                    : {}),
            }}
            {...cardProps}
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
        <MessageBubble
            message={message}
            cardProps={
                vizQuery.data?.type === 'time_series_chart' ||
                vizQuery.data?.type === 'vertical_bar_chart'
                    ? { w: '100%' }
                    : undefined
            }
        >
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
    agentName?: string;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({ message, agentName }) => {
    const name =
        message.role === 'user' ? message.user.name : agentName || 'AI';

    const timeAgo = useTimeAgo(new Date(message.createdAt));

    return (
        <>
            <Group
                maw="70%"
                align="flex-start"
                wrap="nowrap"
                gap="sm"
                style={{
                    marginLeft: message.role === 'user' ? 'auto' : undefined,
                    flexDirection:
                        message.role === 'user' ? 'row-reverse' : 'row',
                }}
            >
                <LightdashUserAvatar
                    variant={message.role === 'assistant' ? 'filled' : 'light'}
                    name={name}
                />

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

                    {message.role === 'assistant' &&
                        message.vizConfigOutput &&
                        message.metricQuery && (
                            <AiResultMessage message={message} />
                        )}
                </Stack>
            </Group>
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
        <Stack h="100%" mah="100%" justify="space-between" gap="lg">
            <Stack
                flex={1}
                style={{ overflowY: 'auto' }}
                py={30}
                ref={scrollRef}
            >
                {thread.messages.map((message) => (
                    <AiThreadMessage
                        key={`${message.role}-${message.uuid}`}
                        message={message}
                        agentName={agentQuery.data?.name ?? 'AI'}
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
