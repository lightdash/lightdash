import {
    type AiAgentMessageAssistant,
    type ToolProposeChangeArgs,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Group,
    Loader,
    Paper,
    Popover,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconBug,
    IconCheck,
    IconCopy,
    IconExclamationCircle,
    IconMessageX,
    IconRefresh,
    IconTestPipe,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { memo, useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../../utils/markdownUtils';
import {
    useRetryAiAgentThreadMessageMutation,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useProjectAiAgents';
import { setArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import {
    useAiAgentThreadMessageStreaming,
    useAiAgentThreadStreamQuery,
} from '../../streaming/useAiAgentThreadStreamQuery';
import styles from './AgentChatAssistantBubble.module.css';
import AgentChatDebugDrawer from './AgentChatDebugDrawer';
import { AiArtifactInline } from './AiArtifactInline';
import { AiArtifactButton } from './ArtifactButton/AiArtifactButton';
import { ContentLink } from './ContentLink';
import { MessageModelIndicator } from './MessageModelIndicator';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { AiChartToolCalls } from './ToolCalls/AiChartToolCalls';
import { AiProposeChangeToolCall } from './ToolCalls/AiProposeChangeToolCall';
import { AiReasoning } from './ToolCalls/AiReasoning';

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
    const { mutate: handleRetry } = useRetryAiAgentThreadMessageMutation();
    const mdStyle = useMdEditorStyle();

    const isPending = message.status === 'pending';
    const hasNoResponse = !isStreaming && !message.message && !isPending;
    const shouldShowRetry = hasNoResponse;

    const baseMessageContent =
        isStreaming && streamingState
            ? streamingState.content
            : message.message ?? '';

    const referencedArtifactsMarkdown =
        !isStreaming &&
        !isPending &&
        message.referencedArtifacts &&
        message.referencedArtifacts.length > 0
            ? `\n\nReferenced answers: ${message.referencedArtifacts
                  .map(
                      (artifact) =>
                          `[${artifact.title}](#artifact-link#artifact-uuid-${artifact.artifactUuid}#version-uuid-${artifact.versionUuid}#artifact-type-${artifact.artifactType})`,
                  )
                  .join(', ')}`
            : '';

    const messageContent = baseMessageContent + referencedArtifactsMarkdown;

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
                    bg="ldGray.0"
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
                            color="ldGray.0"
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
                            color="ldDark.5"
                            leftSection={
                                <MantineIcon
                                    icon={IconRefresh}
                                    size="sm"
                                    color="ldGray.7"
                                />
                            }
                            onClick={() =>
                                handleRetry({
                                    projectUuid,
                                    agentUuid,
                                    threadUuid: message.threadUuid,
                                    messageUuid: message.uuid,
                                })
                            }
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

                            return (
                                <ContentLink
                                    contentType={contentType}
                                    props={props}
                                    message={message}
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                >
                                    {children}
                                </ContentLink>
                            );
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

type Props = {
    message: AiAgentMessageAssistant;
    isActive?: boolean;
    debug?: boolean;
    projectUuid: string;
    agentUuid: string;
    onAddToEvals?: (promptUuid: string) => void;
    renderArtifactsInline?: boolean;
    showAddToEvalsButton?: boolean;
};

export const AssistantBubble: FC<Props> = memo(
    ({
        message,
        isActive = false,
        debug = false,
        projectUuid,
        agentUuid,
        onAddToEvals,
        renderArtifactsInline = false,
        showAddToEvalsButton = false,
    }) => {
        const artifact = useAiAgentStoreSelector(
            (state) => state.aiArtifact.artifact,
        );
        const dispatch = useAiAgentStoreDispatch();

        if (!projectUuid) throw new Error(`Project Uuid not found`);
        if (!agentUuid) throw new Error(`Agent Uuid not found`);

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

        const [popoverOpened, { open: openPopover, close: closePopover }] =
            useDisclosure(false);
        const [feedbackText, setFeedbackText] = useState('');

        const handleUpvote = useCallback(() => {
            updateFeedbackMutation.mutate({
                messageUuid: message.uuid,
                humanScore: upVoted ? 0 : 1,
            });
        }, [updateFeedbackMutation, message.uuid, upVoted]);

        const handleDownvote = useCallback(() => {
            if (downVoted) {
                updateFeedbackMutation.mutate({
                    messageUuid: message.uuid,
                    humanScore: 0,
                });
            } else {
                updateFeedbackMutation.mutate({
                    messageUuid: message.uuid,
                    humanScore: -1,
                });
                openPopover();
            }
        }, [updateFeedbackMutation, message.uuid, downVoted, openPopover]);

        const handleSubmitFeedback = useCallback(() => {
            if (feedbackText.trim().length !== 0) {
                updateFeedbackMutation.mutate({
                    messageUuid: message.uuid,
                    humanScore: -1,
                    humanFeedback: feedbackText.trim(),
                });
            }
            closePopover();
            setFeedbackText('');
        }, [updateFeedbackMutation, message.uuid, feedbackText, closePopover]);

        const handleCancelFeedback = useCallback(() => {
            closePopover();
            setFeedbackText('');
        }, [closePopover]);

        const isPending = message.status === 'pending';
        const isLoading =
            useAiAgentThreadMessageStreaming(
                message.threadUuid,
                message.uuid,
            ) || isPending;

        const isArtifactAvailable =
            !!(message.artifacts && message.artifacts.length > 0) && !isPending;

        return (
            <Stack
                pos="relative"
                w="100%"
                gap="xs"
                bg={isActive ? 'ldGray.0' : 'transparent'}
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
                        {renderArtifactsInline
                            ? // Render artifacts inline directly
                              message.artifacts!.map((messageArtifact) => (
                                  <AiArtifactInline
                                      key={`${messageArtifact.artifactUuid}-${messageArtifact.versionUuid}`}
                                      artifact={messageArtifact}
                                      message={message}
                                      projectUuid={projectUuid}
                                      agentUuid={agentUuid}
                                  />
                              ))
                            : // Render artifact buttons that open modals
                              message.artifacts!.map((messageArtifact) => (
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
                                                  messageUuid: message.uuid,
                                                  threadUuid:
                                                      message.threadUuid,
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
                {!popoverOpened && downVoted && message.humanFeedback && (
                    <Paper p="xs" mt="xs" radius="md" withBorder>
                        <Stack gap="xs">
                            <Group gap="xs">
                                <MantineIcon
                                    icon={IconMessageX}
                                    size={16}
                                    color="ldGray.7"
                                />
                                <Text size="xs" c="dimmed" fw={600}>
                                    User feedback
                                </Text>
                            </Group>
                            <Text size="sm" c="dimmed" fw={500}>
                                {message.humanFeedback}
                            </Text>
                        </Stack>
                    </Paper>
                )}
                {isLoading ? null : (
                    <Group gap={0}>
                        <CopyButton value={message.message ?? ''}>
                            {({ copied, copy }) => (
                                <ActionIcon
                                    variant="subtle"
                                    color="ldGray.9"
                                    aria-label="copy"
                                    onClick={copy}
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
                                color="ldGray.9"
                                aria-label="upvote"
                                onClick={handleUpvote}
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
                            <Popover
                                width={500}
                                position="top-start"
                                trapFocus
                                opened={popoverOpened}
                                onChange={() => {
                                    closePopover();
                                    setFeedbackText('');
                                }}
                                withArrow
                            >
                                <Popover.Target>
                                    <ActionIcon
                                        variant="subtle"
                                        color="ldGray.9"
                                        aria-label="downvote"
                                        onClick={handleDownvote}
                                    >
                                        <MantineIcon
                                            icon={
                                                downVoted
                                                    ? IconThumbDownFilled
                                                    : IconThumbDown
                                            }
                                        />
                                    </ActionIcon>
                                </Popover.Target>
                                <Popover.Dropdown>
                                    <form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            handleSubmitFeedback();
                                        }}
                                    >
                                        <Stack gap="xs">
                                            <Textarea
                                                autoFocus
                                                classNames={{
                                                    input: styles.feedbackInput,
                                                }}
                                                placeholder="Tell us what went wrong, feedback will be added to agent context (optional)"
                                                value={feedbackText}
                                                onChange={(e) =>
                                                    setFeedbackText(
                                                        e.currentTarget.value,
                                                    )
                                                }
                                                minRows={3}
                                                maxRows={5}
                                                radius="md"
                                                resize="vertical"
                                            />
                                            <Group gap="xs">
                                                <Button
                                                    type="submit"
                                                    size="xs"
                                                    color="ldDark.5"
                                                >
                                                    Submit
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={
                                                        handleCancelFeedback
                                                    }
                                                >
                                                    Cancel
                                                </Button>
                                            </Group>
                                        </Stack>
                                    </form>
                                </Popover.Dropdown>
                            </Popover>
                        )}

                        {showAddToEvalsButton && onAddToEvals && (
                            <Tooltip label="Add this response to evals">
                                <ActionIcon
                                    variant="subtle"
                                    color="ldGray.9"
                                    aria-label="Add to evaluation set"
                                    onClick={() => onAddToEvals(message.uuid)}
                                >
                                    <MantineIcon icon={IconTestPipe} />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        {isArtifactAvailable && (
                            <ActionIcon
                                variant="subtle"
                                color="ldGray.9"
                                aria-label="Debug information"
                                onClick={openDrawer}
                            >
                                <MantineIcon icon={IconBug} />
                            </ActionIcon>
                        )}

                        <MessageModelIndicator
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            modelConfig={message.modelConfig}
                        />
                    </Group>
                )}

                <AgentChatDebugDrawer
                    agentUuid={agentUuid}
                    projectUuid={projectUuid}
                    artifacts={message.artifacts}
                    toolCalls={message.toolCalls}
                    toolResults={message.toolResults}
                    isVisualizationAvailable={isArtifactAvailable}
                    isDrawerOpen={isDrawerOpen}
                    onClose={closeDrawer}
                />
            </Stack>
        );
    },
);
