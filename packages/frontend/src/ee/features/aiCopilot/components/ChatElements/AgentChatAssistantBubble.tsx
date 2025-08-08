import {
    AiResultType,
    ChartKind,
    parseVizConfig,
    type AiAgentMessageAssistant,
    type ApiExecuteAsyncMetricQueryResults,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Center,
    CopyButton,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconCheck,
    IconCopy,
    IconExclamationCircle,
    IconLayoutDashboard,
    IconRefresh,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import {
    useAiAgentThreadMessageVizQuery,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useOrganizationAiAgents';
import { useAiAgentThreadStreamMutation } from '../../streaming/useAiAgentThreadStreamMutation';
import {
    useAiAgentThreadMessageStreaming,
    useAiAgentThreadStreamQuery,
} from '../../streaming/useAiAgentThreadStreamQuery';
import styles from './AgentChatAssistantBubble.module.css';
import { AiChartVisualization } from './AiChartVisualization';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { AiChartToolCalls } from './ToolCalls/AiChartToolCalls';

const AssistantBubbleContent: FC<{
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
    metricQuery?: ApiExecuteAsyncMetricQueryResults['metricQuery'];
}> = ({ message, metricQuery, projectUuid, agentUuid }) => {
    const streamingState = useAiAgentThreadStreamQuery(message.threadUuid);
    const isStreaming = useAiAgentThreadMessageStreaming(
        message.threadUuid,
        message.uuid,
    );
    const { streamMessage } = useAiAgentThreadStreamMutation();

    const hasStreamingError =
        streamingState?.error && streamingState?.messageUuid === message.uuid;
    const messageContent =
        isStreaming && streamingState
            ? streamingState.content
            : message.message ?? 'No response...';

    const handleRetry = useCallback(() => {
        void streamMessage({
            agentUuid,
            threadUuid: message.threadUuid,
            messageUuid: message.uuid,
        });
    }, [streamMessage, agentUuid, message.threadUuid, message.uuid]);

    return (
        <>
            {hasStreamingError && (
                <Paper
                    withBorder
                    radius="md"
                    p="md"
                    shadow="none"
                    bg="gray.0"
                    style={{
                        borderStyle: 'dashed',
                    }}
                >
                    <Group gap="xs" align="center" justify="space-between">
                        <Group gap="xs" align="flex-start">
                            <MantineIcon
                                icon={IconExclamationCircle}
                                color="gray"
                                size="sm"
                                style={{ flexShrink: 0, marginTop: '2px' }}
                            />
                            <Stack gap={4}>
                                <Text size="sm" fw={500} c="dimmed">
                                    Something went wrong
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Failed to generate response. Please try
                                    again.
                                </Text>
                            </Stack>
                        </Group>
                        <Button
                            size="xs"
                            variant="default"
                            color="dark.5"
                            leftSection={
                                <MantineIcon icon={IconRefresh} size="xs" />
                            }
                            onClick={handleRetry}
                        >
                            Try again
                        </Button>
                    </Group>
                </Paper>
            )}

            {isStreaming && (
                <AiChartToolCalls
                    toolCalls={streamingState?.toolCalls}
                    type="streaming"
                />
            )}

            {!isStreaming && message.toolCalls.length > 0 && (
                <AiChartToolCalls
                    toolCalls={message.toolCalls}
                    type="persisted"
                    metricQuery={metricQuery}
                    projectUuid={projectUuid}
                />
            )}
            {messageContent.length > 0 ? (
                <MDEditor.Markdown
                    source={messageContent}
                    style={{ padding: `0.5rem 0` }}
                    rehypePlugins={[rehypeAiAgentContentLinks]}
                    components={{
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
            {isStreaming ? <Loader type="dots" color="gray" /> : null}
        </>
    );
};

export const AssistantBubble: FC<{
    message: AiAgentMessageAssistant;
    isPreview?: boolean;
}> = memo(({ message, isPreview = false }) => {
    const { agentUuid, projectUuid } = useParams();
    if (!projectUuid) throw new Error(`Project Uuid not found`);
    if (!agentUuid) throw new Error(`Agent Uuid not found`);

    const vizConfig = useMemo(
        () => parseVizConfig(message.vizConfigOutput),
        [message.vizConfigOutput],
    );

    const hasVizConfig = !!vizConfig;
    const isChartVisualization =
        hasVizConfig && vizConfig.type !== AiResultType.TABLE_RESULT;
    const isTableVisualization =
        hasVizConfig &&
        vizConfig.type === AiResultType.TABLE_RESULT &&
        vizConfig.vizTool.vizConfig.limit !== 1;
    const isVisualizationAvailable =
        hasVizConfig && (isChartVisualization || isTableVisualization);

    const queryExecutionHandle = useAiAgentThreadMessageVizQuery(
        {
            projectUuid,
            agentUuid,
            threadUuid: message.threadUuid,
            messageUuid: message.uuid,
        },
        { enabled: isVisualizationAvailable },
    );

    const queryResults = useInfiniteQueryResults(
        projectUuid,
        queryExecutionHandle?.data?.query.queryUuid,
    );

    const isQueryLoading =
        queryExecutionHandle.isLoading || queryResults.isFetchingRows;
    const isQueryError = queryExecutionHandle.isError || queryResults.error;

    const updateFeedbackMutation = useUpdatePromptFeedbackMutation(
        agentUuid,
        message.threadUuid,
    );

    const upVoted = message.humanScore === 1;
    const downVoted = message.humanScore === -1;
    const hasRating = upVoted || downVoted;

    const handleUpvote = useCallback(() => {
        if (hasRating) return;
        updateFeedbackMutation.mutate({
            messageUuid: message.uuid,
            humanScore: 1,
        });
    }, [hasRating, updateFeedbackMutation, message.uuid]);

    const handleDownvote = useCallback(() => {
        if (hasRating) return;
        updateFeedbackMutation.mutate({
            messageUuid: message.uuid,
            humanScore: -1,
        });
    }, [hasRating, updateFeedbackMutation, message.uuid]);

    const isLoading = useAiAgentThreadMessageStreaming(
        message.threadUuid,
        message.uuid,
    );

    return (
        <Stack
            pos="relative"
            w="100%"
            gap="xs"
            style={{
                overflow: 'unset',
                borderStartStartRadius: '0px',
            }}
        >
            <AssistantBubbleContent
                message={message}
                metricQuery={queryExecutionHandle.data?.query.metricQuery}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
            />

            {isVisualizationAvailable && (
                <Paper
                    withBorder
                    radius="md"
                    p="md"
                    h="500px"
                    shadow="none"
                    {...((queryExecutionHandle.isError ||
                        queryExecutionHandle.isLoading) && {
                        bg: 'gray.0',
                        style: {
                            borderStyle: 'dashed',
                        },
                    })}
                >
                    {isQueryLoading ? (
                        <Center h="100%">
                            <Loader
                                type="dots"
                                color="gray"
                                delayedMessage="Loading visualization..."
                            />
                        </Center>
                    ) : isQueryError ? (
                        <Stack
                            gap="xs"
                            align="center"
                            justify="center"
                            h="100%"
                        >
                            <MantineIcon
                                icon={IconExclamationCircle}
                                color="gray"
                            />
                            <Text size="xs" c="dimmed" ta="center">
                                Something went wrong generating the
                                visualization, please try again
                            </Text>
                        </Stack>
                    ) : (
                        <AiChartVisualization
                            results={queryResults}
                            message={message}
                            queryExecutionHandle={queryExecutionHandle}
                            projectUuid={projectUuid}
                        />
                    )}
                </Paper>
            )}
            <Group gap={0} display={isPreview ? 'none' : 'flex'}>
                <CopyButton value={message.message ?? ''}>
                    {({ copied, copy }) => (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="copy"
                            onClick={copy}
                            style={{ display: isLoading ? 'none' : 'block' }}
                        >
                            <MantineIcon icon={copied ? IconCheck : IconCopy} />
                        </ActionIcon>
                    )}
                </CopyButton>

                {(!hasRating || upVoted) && (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="upvote"
                        onClick={handleUpvote}
                        display={isLoading ? 'none' : 'block'}
                    >
                        <Tooltip
                            label="Feedback sent"
                            position="top"
                            withinPortal
                            withArrow
                            // Hack to only render tooltip (on hover) when `hasRating` is false
                            opened={hasRating ? undefined : false}
                        >
                            <MantineIcon
                                icon={upVoted ? IconThumbUpFilled : IconThumbUp}
                            />
                        </Tooltip>
                    </ActionIcon>
                )}

                {(!hasRating || downVoted) && (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="downvote"
                        onClick={handleDownvote}
                        display={isLoading ? 'none' : 'block'}
                    >
                        <MantineIcon
                            icon={
                                downVoted ? IconThumbDownFilled : IconThumbDown
                            }
                        />
                    </ActionIcon>
                )}
            </Group>
        </Stack>
    );
});
