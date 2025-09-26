import { ChartKind, type AiAgentMessageAssistant } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    CopyButton,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconArrowRight,
    IconBug,
    IconCheck,
    IconCopy,
    IconExclamationCircle,
    IconLayoutDashboard,
    IconRefresh,
    IconTestPipe,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { memo, useCallback, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import { useUpdatePromptFeedbackMutation } from '../../hooks/useProjectAiAgents';
import { setArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { useAiAgentThreadStreamMutation } from '../../streaming/useAiAgentThreadStreamMutation';
import {
    useAiAgentThreadMessageStreaming,
    useAiAgentThreadStreamQuery,
} from '../../streaming/useAiAgentThreadStreamQuery';
import styles from './AgentChatAssistantBubble.module.css';
import AgentChatDebugDrawer from './AgentChatDebugDrawer';
import { AiArtifactButton } from './ArtifactButton/AiArtifactButton';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { AiChartToolCalls } from './ToolCalls/AiChartToolCalls';

const AssistantBubbleContent: FC<{
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
}> = ({ message, projectUuid, agentUuid }) => {
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

    return (
        <>
            {hasStreamingError && (
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

            {isStreaming && (
                <AiChartToolCalls
                    toolCalls={streamingState?.toolCalls}
                    type="streaming"
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={message.threadUuid}
                />
            )}
            {!isStreaming && message.toolCalls.length > 0 && (
                <AiChartToolCalls
                    toolCalls={message.toolCalls}
                    type="persisted"
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={message.threadUuid}
                />
            )}
            {messageContent.length > 0 ? (
                <MDEditor.Markdown
                    source={messageContent}
                    style={{ padding: `0.5rem 0`, fontSize: '0.875rem' }}
                    rehypePlugins={[rehypeAiAgentContentLinks]}
                    components={{
                        hr: () => <Divider color="gray.4" my="sm" />,
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

type Props = {
    message: AiAgentMessageAssistant;
    isActive?: boolean;
    debug?: boolean;
    projectUuid: string;
    agentUuid: string;
    showAddToEvalsButton?: boolean;
    onAddToEvals?: (promptUuid: string) => void;
};

export const AssistantBubble: FC<Props> = memo(
    ({
        message,
        isActive = false,
        debug = false,
        projectUuid,
        agentUuid,
        showAddToEvalsButton,
        onAddToEvals,
    }) => {
        const artifact = useAiAgentStoreSelector(
            (state) => state.aiArtifact.artifact,
        );
        const dispatch = useAiAgentStoreDispatch();

        if (!projectUuid) throw new Error(`Project Uuid not found`);
        if (!agentUuid) throw new Error(`Agent Uuid not found`);

        const isArtifactAvailable = !!(
            message.artifacts && message.artifacts.length > 0
        );

        const [isDrawerOpen, { open: openDrawer, close: closeDrawer }] =
            useDisclosure(debug);

        const updateFeedbackMutation = useUpdatePromptFeedbackMutation(
            projectUuid,
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
                bg={isActive ? 'gray.0' : 'transparent'}
                style={{
                    overflow: 'unset',
                    borderStartStartRadius: '0px',
                }}
            >
                <AssistantBubbleContent
                    message={message}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                />

                {isArtifactAvailable && projectUuid && agentUuid && (
                    <Stack gap="xs">
                        {message.artifacts!.map((messageArtifact) => (
                            <AiArtifactButton
                                key={`${messageArtifact.artifactUuid}-${messageArtifact.versionUuid}`}
                                onClick={() => {
                                    if (
                                        artifact?.artifactUuid ===
                                            messageArtifact.artifactUuid &&
                                        artifact?.versionUuid ===
                                            messageArtifact.versionUuid
                                    ) {
                                        return;
                                    }
                                    dispatch(
                                        setArtifact({
                                            artifactUuid:
                                                messageArtifact.artifactUuid,
                                            versionUuid:
                                                messageArtifact.versionUuid,
                                            message: message,
                                            projectUuid: projectUuid,
                                            agentUuid: agentUuid,
                                        }),
                                    );
                                }}
                                isArtifactOpen={
                                    artifact?.artifactUuid ===
                                        messageArtifact.artifactUuid &&
                                    artifact?.versionUuid ===
                                        messageArtifact.versionUuid
                                }
                                artifact={messageArtifact}
                            />
                        ))}
                    </Stack>
                )}
                <Group gap={0}>
                    <CopyButton value={message.message ?? ''}>
                        {({ copied, copy }) => (
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="copy"
                                onClick={copy}
                                style={{
                                    display: isLoading ? 'none' : 'block',
                                }}
                            >
                                <MantineIcon
                                    icon={copied ? IconCheck : IconCopy}
                                />
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
                                    icon={
                                        upVoted
                                            ? IconThumbUpFilled
                                            : IconThumbUp
                                    }
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
                                    downVoted
                                        ? IconThumbDownFilled
                                        : IconThumbDown
                                }
                            />
                        </ActionIcon>
                    )}

                    {showAddToEvalsButton && onAddToEvals && (
                        <Tooltip label="Add this response to evals">
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Add to evaluation set"
                                onClick={() => onAddToEvals(message.uuid)}
                                display={isLoading ? 'none' : 'block'}
                            >
                                <MantineIcon icon={IconTestPipe} color="gray" />
                            </ActionIcon>
                        </Tooltip>
                    )}

                    {isArtifactAvailable && (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Debug information"
                            onClick={openDrawer}
                        >
                            <MantineIcon icon={IconBug} color="gray" />
                        </ActionIcon>
                    )}
                </Group>

                <AgentChatDebugDrawer
                    agentUuid={agentUuid}
                    projectUuid={projectUuid}
                    artifacts={message.artifacts}
                    toolCalls={message.toolCalls}
                    isVisualizationAvailable={isArtifactAvailable}
                    isDrawerOpen={isDrawerOpen}
                    onClose={closeDrawer}
                />
            </Stack>
        );
    },
);
