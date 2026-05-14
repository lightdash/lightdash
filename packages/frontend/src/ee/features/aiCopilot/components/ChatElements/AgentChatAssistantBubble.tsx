import {
    ToolNameSchema,
    type AiAgentMessageAssistant,
    type ToolName,
    type ToolProposeChangeArgs,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    CopyButton,
    Group,
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
import { memo, useCallback, useState, type FC } from 'react';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
// streamdown is a streaming-aware drop-in for react-markdown — used for the
// final answer + intermediate text chunks in the AI bubble.
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useMdEditorStyle } from '../../../../../utils/markdownUtils';
import {
    useRetryAiAgentThreadMessageMutation,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useProjectAiAgents';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
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
import { AiProposeChangeToolCall } from './ToolCalls/AiProposeChangeToolCall';
import { ImproveContextToolCall } from './ToolCalls/ImproveContextToolCall';
import {
    LiveActivityCard,
    ReasoningHistoryRow,
    type LiveActivityToolGroup,
} from './ToolCalls/LiveActivityCard';
import { toReasoningTexts } from './ToolCalls/reasoningHelpers';
import { SqlApprovalCard } from './ToolCalls/SqlApprovalCard';
import { type ToolCallSummary } from './ToolCalls/utils/types';
import { TypingDots } from './TypingDots';

type ToolGroup = {
    kind: 'toolGroup';
    toolName: ToolName;
    calls: ToolCallSummary[];
    keyId: string;
};
type TextSegment = { kind: 'text'; text: string; idx: number };
type SqlApprovalSegment = {
    kind: 'sqlApproval';
    toolCallId: string;
    sql: string;
    limit?: number;
};
type StreamSegment = TextSegment | ToolGroup | SqlApprovalSegment;

const segmentStreamParts = (
    parts: StreamPart[],
    decidedToolCallIds: string[],
): StreamSegment[] => {
    const segments: StreamSegment[] = [];
    parts.forEach((part, idx) => {
        if (part.type === 'text') {
            segments.push({ kind: 'text', text: part.text, idx });
            return;
        }
        if (
            part.toolName === 'improveContext' ||
            part.toolName === 'proposeChange'
        ) {
            return;
        }
        if (
            part.toolName === 'runSql' &&
            !decidedToolCallIds.includes(part.toolCallId)
        ) {
            const args = part.toolArgs as { sql: string; limit?: number };
            segments.push({
                kind: 'sqlApproval',
                toolCallId: part.toolCallId,
                sql: args.sql,
                limit: args.limit,
            });
            return;
        }
        const call: ToolCallSummary = {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            toolArgs: part.toolArgs,
        };
        const last = segments[segments.length - 1];
        if (
            last &&
            last.kind === 'toolGroup' &&
            last.toolName === part.toolName
        ) {
            last.calls.push(call);
        } else {
            segments.push({
                kind: 'toolGroup',
                toolName: part.toolName,
                calls: [call],
                keyId: part.toolCallId,
            });
        }
    });
    return segments;
};

const groupPersistedToolCalls = (
    calls: ToolCallSummary[],
): { toolName: ToolName; calls: ToolCallSummary[]; keyId: string }[] => {
    const groups: {
        toolName: ToolName;
        calls: ToolCallSummary[];
        keyId: string;
    }[] = [];
    for (const tc of calls) {
        const parsed = ToolNameSchema.safeParse(tc.toolName);
        if (!parsed.success) continue;
        const last = groups[groups.length - 1];
        if (last && last.toolName === parsed.data) {
            last.calls.push(tc);
        } else {
            groups.push({
                toolName: parsed.data,
                calls: [tc],
                keyId: tc.toolCallId,
            });
        }
    }
    return groups;
};

const AssistantBubbleContent: FC<{
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
}> = ({ message, projectUuid, agentUuid }) => {
    const threadStreamingState = useAiAgentThreadStreamQuery(
        message.threadUuid,
    );
    // The thread-level streaming state is shared across all messages on the
    // thread. We must only use it for *this* message's bubble — otherwise the
    // previous bubble would mirror the next prompt's parts.
    const streamingState =
        threadStreamingState?.messageUuid === message.uuid
            ? threadStreamingState
            : null;
    const isStreaming = useAiAgentThreadMessageStreaming(
        message.threadUuid,
        message.uuid,
    );
    const { mutate: handleRetry } = useRetryAiAgentThreadMessageMutation();
    const mdStyle = useMdEditorStyle();

    const isPending = message.status === 'pending';
    const hasError = message.status === 'error';
    const hasNoResponse = !isStreaming && !message.message && !isPending;
    const shouldShowRetry = hasError || hasNoResponse;

    const baseMessageContent =
        isStreaming && streamingState
            ? streamingState.content
            : (message.message ?? '');

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
        ? (streamingState?.toolCalls ?? [])
        : message.toolCalls;

    return (
        <>
            {shouldShowRetry && (
                <Paper
                    variant="dotted"
                    radius="md"
                    pr="md"
                    shadow="none"
                    bg="ldGray.0"
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
                            radius="md"
                            w="80%"
                        >
                            <Stack gap={4}>
                                <Text size="sm" fw={500} c="dimmed">
                                    Something went wrong
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {message.errorMessage ||
                                        'Failed to generate response. Please try again.'}
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

            {/* Reasoning lives inside the LiveActivityCard at all times, so
             *  there is one unified bento for the agent's process. */}
            {(() => {
                const segments = streamingState?.parts
                    ? segmentStreamParts(
                          streamingState.parts,
                          streamingState.decidedToolCallIds,
                      )
                    : [];

                if (segments.length > 0) {
                    // Tool segments are extracted into a single LiveActivityCard
                    // pinned below the texts. Texts keep their interleaved order
                    // with intermediates collapsed; the latest text stays open.
                    const liveToolGroups: LiveActivityToolGroup[] = segments
                        .filter(
                            (
                                s,
                            ): s is Extract<typeof s, { kind: 'toolGroup' }> =>
                                s.kind === 'toolGroup',
                        )
                        .map((s) => ({
                            toolName: s.toolName,
                            calls: s.calls,
                            keyId: s.keyId,
                        }));
                    const sqlApprovals = segments.filter(
                        (s): s is Extract<typeof s, { kind: 'sqlApproval' }> =>
                            s.kind === 'sqlApproval',
                    );
                    const textSegments = segments.filter(
                        (s): s is Extract<typeof s, { kind: 'text' }> =>
                            s.kind === 'text',
                    );
                    const latestTextSeg = textSegments[textSegments.length - 1];
                    const finalAnswerMd = latestTextSeg ? (
                        <Box
                            className={`${styles.aiMarkdown} ${
                                isStreaming ? styles.streamingNarration : ''
                            }`}
                            style={mdStyle}
                        >
                            <Streamdown
                                parseIncompleteMarkdown
                                controls={false}
                                caret="block"
                                isAnimating={isStreaming}
                                mode={isStreaming ? 'streaming' : 'static'}
                                remarkPlugins={[remarkGfm, remarkEmoji]}
                                rehypePlugins={[rehypeAiAgentContentLinks]}
                                components={{
                                    a: ({ node, children, ...props }) => {
                                        const contentType =
                                            'data-content-type' in props &&
                                            typeof props[
                                                'data-content-type'
                                            ] === 'string'
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
                            >
                                {latestTextSeg.text}
                            </Streamdown>
                        </Box>
                    ) : null;
                    const pendingApprovalContent =
                        sqlApprovals.length > 0 ? (
                            <Stack gap={6}>
                                {sqlApprovals.map((seg) => (
                                    <SqlApprovalCard
                                        key={seg.toolCallId}
                                        projectUuid={projectUuid}
                                        agentUuid={agentUuid}
                                        threadUuid={message.threadUuid}
                                        toolCallId={seg.toolCallId}
                                        toolArgs={{
                                            sql: seg.sql,
                                            limit: seg.limit,
                                        }}
                                    />
                                ))}
                            </Stack>
                        ) : null;
                    return (
                        <Stack gap={4} pt="xs">
                            {/* Activity card sits ABOVE the rolling preview /
                             *  final answer so tool work reads top-to-bottom:
                             *  what was done → the answer. After streaming we
                             *  fold reasoning into the activity card so the
                             *  answer remains the focal point. SQL approvals
                             *  drop into the card's body, auto-expanded. */}
                            {(() => {
                                const reasoningTexts = toReasoningTexts(
                                    !isStreaming
                                        ? message.reasoning
                                        : undefined,
                                    isStreaming
                                        ? streamingState?.reasoning
                                        : undefined,
                                );
                                return reasoningTexts.length > 0 ? (
                                    <ReasoningHistoryRow
                                        texts={reasoningTexts}
                                        isLive={isStreaming}
                                    />
                                ) : null;
                            })()}
                            {(liveToolGroups.length > 0 ||
                                pendingApprovalContent) && (
                                <LiveActivityCard
                                    toolGroups={liveToolGroups}
                                    isLive={isStreaming}
                                    toolResults={message.toolResults}
                                    pendingContent={pendingApprovalContent}
                                />
                            )}
                            {latestTextSeg ? (
                                <Box className={styles.streamPart}>
                                    {finalAnswerMd}
                                </Box>
                            ) : null}
                        </Stack>
                    );
                }

                // Fallback (page reload, no streamingState): activity card ON
                // TOP showing what the agent did + reasoning folded in, then
                // the final markdown answer below as the hero.
                const renderableToolCalls = toolCalls.filter(
                    (tc) =>
                        tc.toolName !== 'improveContext' &&
                        tc.toolName !== 'proposeChange',
                );
                const persistedToolGroups: LiveActivityToolGroup[] =
                    groupPersistedToolCalls(renderableToolCalls);
                return (
                    <>
                        <ImproveContextToolCall
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            threadUuid={message.threadUuid}
                            promptUuid={message.uuid}
                        />
                        {persistedToolGroups.length > 0 && (
                            <LiveActivityCard
                                toolGroups={persistedToolGroups}
                                isLive={isStreaming || isPending}
                                toolResults={message.toolResults}
                            />
                        )}
                        {message.reasoning && message.reasoning.length > 0 && (
                            <ReasoningHistoryRow
                                texts={toReasoningTexts(
                                    message.reasoning,
                                    undefined,
                                )}
                                isLive={false}
                            />
                        )}
                        {messageContent.length > 0 ? (
                            <Box
                                className={styles.aiMarkdown}
                                style={{ ...mdStyle, paddingBlock: '0.5rem' }}
                            >
                                <Streamdown
                                    parseIncompleteMarkdown
                                    controls={false}
                                    animated
                                    mode="static"
                                    remarkPlugins={[remarkGfm, remarkEmoji]}
                                    rehypePlugins={[rehypeAiAgentContentLinks]}
                                    components={{
                                        a: ({ node, children, ...props }) => {
                                            const contentType =
                                                'data-content-type' in props &&
                                                typeof props[
                                                    'data-content-type'
                                                ] === 'string'
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
                                >
                                    {messageContent}
                                </Streamdown>
                            </Box>
                        ) : null}
                    </>
                );
            })()}
            {/* TypingDots fill the gap until the first visible output lands —
             *  any tool call or text part. Reasoning alone doesn't count: it
             *  collapses by default and would otherwise leave the bubble silent.
             *  Once a part exists, the bento + rolling preview take over. */}
            {(isStreaming || isPending) &&
                (streamingState?.parts?.length ?? 0) === 0 && <TypingDots />}
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
