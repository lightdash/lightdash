import {
    ChartKind,
    type AiAgentMessageAssistant,
    type ToolProposeChangeArgs,
} from '@lightdash/common';
import {
    Alert,
    Anchor,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconExclamationCircle,
    IconLayoutDashboard,
    IconRefresh,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../../utils/markdownUtils';
import { useAiAgentThreadStreamMutation } from '../../streaming/useAiAgentThreadStreamMutation';
import {
    useAiAgentThreadMessageStreaming,
    useAiAgentThreadStreamQuery,
} from '../../streaming/useAiAgentThreadStreamQuery';
import styles from './AssistantBubbleContent.module.css';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { AiChartToolCalls } from './ToolCalls/AiChartToolCalls';
import { AiProposeChangeToolCall } from './ToolCalls/AiProposeChangeToolCall';
import { AiReasoning } from './ToolCalls/AiReasoning';

type Props = {
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

export const AssistantBubbleContent: FC<Props> = ({
    message,
    projectUuid,
    agentUuid,
}) => {
    const streamingState = useAiAgentThreadStreamQuery(message.threadUuid);
    const isStreaming = useAiAgentThreadMessageStreaming(
        message.threadUuid,
        message.uuid,
    );
    const { streamMessage } = useAiAgentThreadStreamMutation();
    const mdStyle = useMdEditorStyle();

    const isPending = message.status === 'pending';
    const hasStreamingError =
        streamingState?.error && streamingState?.messageUuid === message.uuid;
    const hasNoResponse = !isStreaming && !message.message && !isPending;
    const shouldShowRetry = hasStreamingError || hasNoResponse;

    const messageContent =
        isStreaming && streamingState
            ? streamingState.content
            : message.message ?? '';

    const handleRetry = useCallback(() => {
        void streamMessage({
            projectUuid,
            agentUuid,
            threadUuid: message.threadUuid,
            messageUuid: message.uuid,
        });
    }, [
        streamMessage,
        agentUuid,
        message.threadUuid,
        message.uuid,
        projectUuid,
    ]);

    const proposeChangeToolCall = isStreaming
        ? (streamingState?.toolCalls.find((t) => t.toolName === 'proposeChange')
              ?.toolArgs as ToolProposeChangeArgs)
        : (message.toolCalls.find((t) => t.toolName === 'proposeChange')
              ?.toolArgs as ToolProposeChangeArgs); // TODO: fix message type, it's `object` now

    const proposeChangeToolResult = message.toolResults.find(
        (result) => result.toolName === 'proposeChange',
    );

    const toolCalls = isStreaming
        ? streamingState?.toolCalls ?? []
        : message.toolCalls;

    return (
        <>
            {shouldShowRetry && (
                <Paper
                    withBorder
                    radius="md"
                    pr="md"
                    shadow="none"
                    bg="gray.0"
                    style={{
                        borderStyle: 'dashed',
                    }}
                >
                    <Group gap="xs" align="center" justify="space-between">
                        <Alert
                            icon={
                                <MantineIcon
                                    icon={IconExclamationCircle}
                                    color="gray"
                                    size="md"
                                />
                            }
                            color="gray.0"
                            variant="outline"
                        >
                            <Stack gap={4}>
                                <Text size="sm" fw={500} c="dimmed">
                                    Something went wrong
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Failed to generate response. Please try
                                    again.
                                </Text>
                            </Stack>
                        </Alert>
                        <Button
                            size="xs"
                            variant="default"
                            color="dark.5"
                            leftSection={
                                <MantineIcon
                                    icon={IconRefresh}
                                    size="sm"
                                    color="gray.7"
                                />
                            }
                            onClick={handleRetry}
                        >
                            Try again
                        </Button>
                    </Group>
                </Paper>
            )}

            {isStreaming && streamingState?.reasoning && (
                <AiReasoning
                    reasoning={streamingState.reasoning}
                    type="streaming"
                />
            )}
            {!isStreaming && message.reasoning.length > 0 && (
                <AiReasoning reasoning={message.reasoning} type="persisted" />
            )}
            {toolCalls.length > 0 ? (
                <AiChartToolCalls
                    toolCalls={toolCalls}
                    type={isStreaming || isPending ? 'streaming' : 'persisted'}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={message.threadUuid}
                    promptUuid={message.uuid}
                />
            ) : null}
            {messageContent.length > 0 ? (
                <MDEditor.Markdown
                    rehypeRewrite={rehypeRemoveHeaderLinks}
                    source={messageContent}
                    style={{ ...mdStyle, padding: `0.5rem 0` }}
                    rehypePlugins={[rehypeAiAgentContentLinks]}
                    components={{
                        ...mdEditorComponents,
                        a: ({ node, children, ...props }) => {
                            const contentType =
                                'data-content-type' in props &&
                                typeof props['data-content-type'] === 'string'
                                    ? props['data-content-type']
                                    : undefined;
                            const chartType =
                                'data-chart-type' in props &&
                                typeof props['data-chart-type'] === 'string'
                                    ? props['data-chart-type']
                                    : undefined;

                            if (contentType === 'dashboard-link') {
                                return (
                                    <Anchor
                                        {...props}
                                        target="_blank"
                                        fz="sm"
                                        fw={500}
                                        bg="gray.0"
                                        c="gray.7"
                                        td="none"
                                        classNames={{
                                            root: styles.contentLink,
                                        }}
                                    >
                                        <MantineIcon
                                            icon={IconLayoutDashboard}
                                            size="md"
                                            color="green.7"
                                            fill="green.6"
                                            fillOpacity={0.2}
                                            strokeWidth={1.9}
                                        />

                                        {/* margin is added by md package */}
                                        <Text fz="sm" fw={500} m={0}>
                                            {children}
                                        </Text>

                                        <MantineIcon
                                            icon={IconArrowRight}
                                            color="gray.7"
                                            size="sm"
                                            strokeWidth={2.0}
                                        />
                                    </Anchor>
                                );
                            } else if (contentType === 'chart-link') {
                                const chartTypeKind =
                                    chartType &&
                                    Object.values(ChartKind).includes(
                                        chartType as ChartKind,
                                    )
                                        ? (chartType as ChartKind)
                                        : undefined;
                                return (
                                    <Anchor
                                        {...props}
                                        target="_blank"
                                        fz="sm"
                                        fw={500}
                                        bg="gray.0"
                                        c="gray.7"
                                        td="none"
                                        classNames={{
                                            root: styles.contentLink,
                                        }}
                                    >
                                        {chartTypeKind && (
                                            <MantineIcon
                                                icon={getChartIcon(
                                                    chartTypeKind,
                                                )}
                                                size="md"
                                                color="blue.7"
                                                fill="blue.4"
                                                fillOpacity={0.2}
                                                strokeWidth={1.9}
                                            />
                                        )}

                                        {/* margin is added by md package */}
                                        <Text fz="sm" fw={500} m={0}>
                                            {children}
                                        </Text>

                                        <MantineIcon
                                            icon={IconArrowRight}
                                            color="gray.7"
                                            size="sm"
                                            strokeWidth={2.0}
                                        />
                                    </Anchor>
                                );
                            }

                            return <a {...props}>{children}</a>;
                        },
                    }}
                />
            ) : null}
            {isStreaming || isPending ? (
                <Loader type="dots" color="gray" />
            ) : null}
            {proposeChangeToolCall && (
                <AiProposeChangeToolCall
                    change={proposeChangeToolCall.change}
                    entityTableName={proposeChangeToolCall.entityTableName}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={message.threadUuid}
                    promptUuid={message.uuid}
                    toolResult={proposeChangeToolResult}
                />
            )}
        </>
    );
};
