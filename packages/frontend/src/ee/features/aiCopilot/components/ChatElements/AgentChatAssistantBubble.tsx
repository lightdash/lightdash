import {
    AiResultType,
    parseVizConfig,
    type AiAgentMessageAssistant,
    type ApiExecuteAsyncMetricQueryResults,
} from '@lightdash/common';
import {
    ActionIcon,
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
    IconCheck,
    IconCopy,
    IconExclamationCircle,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import {
    useAiAgentThreadMessageVizQuery,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useOrganizationAiAgents';
import {
    useAiAgentThreadStreaming,
    useAiAgentThreadStreamQuery,
} from '../../streaming/useAiAgentThreadStreamQuery';
import { isOptimisticMessageStub } from '../../utils/thinkingMessageStub';
import { AiChartVisualization } from './AiChartVisualization';
import { AiChartToolCalls } from './ToolCalls/AiChartToolCalls';

const AssistantBubbleContent: FC<{
    message: AiAgentMessageAssistant;
    projectUuid: string;
    metricQuery?: ApiExecuteAsyncMetricQueryResults['metricQuery'];
}> = ({ message, metricQuery, projectUuid }) => {
    const streamingState = useAiAgentThreadStreamQuery(message.threadUuid);
    const isStubbed = isOptimisticMessageStub(message.message);
    const isStreaming =
        useAiAgentThreadStreaming(message.threadUuid) && isStubbed;
    const messageContent =
        isStreaming && streamingState
            ? streamingState.content
            : isStubbed // avoid brief flash of `THINKING_STUB`
            ? ''
            : message.message ?? 'No response...';
    return (
        <>
            <AiChartToolCalls
                toolCalls={streamingState?.toolCalls ?? message.toolCalls}
                type={
                    streamingState
                        ? isStreaming
                            ? 'streaming'
                            : 'finished-streaming'
                        : 'persisted'
                }
                metricQuery={metricQuery}
                projectUuid={projectUuid}
            />
            <MDEditor.Markdown
                source={messageContent}
                style={{ backgroundColor: 'transparent', padding: `0.5rem 0` }}
            />
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

    const isLoading =
        useAiAgentThreadStreaming(message.threadUuid) &&
        isOptimisticMessageStub(message.message);

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
                        <Stack gap="xs" align="center">
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
