import {
    type AiAgentToolName,
    type AiAgentMessageAssistant,
    type AiAgentToolCall,
    type AiMcpServer,
    isToolProposeChangeResult,
    type ToolProposeChangeArgs,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Code,
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
    IconPlug,
    IconRefresh,
    IconTerminal2,
    IconTestPipe,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
// streamdown is a streaming-aware drop-in for react-markdown — used for the
// final answer + intermediate text chunks in the AI bubble.
import { Streamdown, type CustomRendererProps } from 'streamdown';
import 'streamdown/styles.css';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useMdEditorStyle } from '../../../../../utils/markdownUtils';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import {
    useRetryAiAgentThreadMessageMutation,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useProjectAiAgents';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import { clearArtifact, setArtifact } from '../../store/aiArtifactSlice';
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
import { ContentLink, type SqlRunnerLinkState } from './ContentLink';
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
    toolName: AiAgentToolName;
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

const HIDDEN_TOOL_NAMES = new Set<AiAgentToolName>([
    'improveContext',
    'proposeChange',
    'generateUuids',
]);

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
        if (HIDDEN_TOOL_NAMES.has(part.toolName)) {
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
            toolOutput: part.toolOutput,
            isPreliminary: part.isPreliminary,
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
): { toolName: AiAgentToolName; calls: ToolCallSummary[]; keyId: string }[] => {
    const groups: {
        toolName: AiAgentToolName;
        calls: ToolCallSummary[];
        keyId: string;
    }[] = [];
    for (const tc of calls) {
        const last = groups[groups.length - 1];
        if (last && last.toolName === tc.toolName) {
            last.calls.push(tc);
        } else {
            groups.push({
                toolName: tc.toolName,
                calls: [tc],
                keyId: tc.toolCallId,
            });
        }
    }
    return groups;
};

const getPendingPersistedSqlApprovals = (
    message: AiAgentMessageAssistant,
): AiAgentToolCall[] => {
    const resolvedToolCallIds = new Set(
        message.toolResults.map((result) => result.toolCallId),
    );

    return message.toolCalls.filter(
        (toolCall) =>
            toolCall.toolName === 'runSql' &&
            !resolvedToolCallIds.has(toolCall.toolCallId),
    );
};

const getToolOutputStatus = (toolOutput: unknown) => {
    const metadata = (toolOutput as { metadata?: unknown } | undefined)
        ?.metadata;

    if (!metadata || typeof metadata !== 'object' || !('status' in metadata)) {
        return undefined;
    }

    const status = (metadata as { status?: unknown }).status;
    return typeof status === 'string' ? status : undefined;
};

const getRunSqlTimeoutErrorMessage = (
    message: AiAgentMessageAssistant,
): string | null => {
    const hasRunSqlTimeout = message.toolResults.some(
        (result) =>
            result.toolName === 'runSql' &&
            getToolOutputStatus(result) === 'timeout',
    );

    return hasRunSqlTimeout
        ? 'SQL approval timed out before the query could run. Approve the SQL prompt or retry when ready.'
        : null;
};

const getRunSqlLinkStateFromArgs = (
    toolArgs: unknown,
): SqlRunnerLinkState | null => {
    if (!toolArgs || typeof toolArgs !== 'object' || !('sql' in toolArgs)) {
        return null;
    }

    const { sql, limit } = toolArgs as { sql?: unknown; limit?: unknown };

    if (typeof sql !== 'string') {
        return null;
    }

    return typeof limit === 'number' ? { sql, limit } : { sql };
};

const getLatestSuccessfulRunSqlLinkState = ({
    message,
    streamParts,
}: {
    message: AiAgentMessageAssistant;
    streamParts?: StreamPart[];
}): SqlRunnerLinkState | null => {
    if (streamParts) {
        for (let idx = streamParts.length - 1; idx >= 0; idx -= 1) {
            const part = streamParts[idx];

            if (
                part.type !== 'toolCall' ||
                part.toolName !== 'runSql' ||
                part.isPreliminary === true ||
                getToolOutputStatus(part.toolOutput) !== 'success'
            ) {
                continue;
            }

            const linkState = getRunSqlLinkStateFromArgs(part.toolArgs);
            if (linkState) return linkState;
        }
    }

    const successfulRunSqlToolCallIds = new Set(
        message.toolResults
            .filter(
                (result) =>
                    result.toolName === 'runSql' &&
                    getToolOutputStatus(result) === 'success',
            )
            .map((result) => result.toolCallId),
    );

    for (let idx = message.toolCalls.length - 1; idx >= 0; idx -= 1) {
        const toolCall = message.toolCalls[idx];

        if (
            toolCall.toolName !== 'runSql' ||
            !successfulRunSqlToolCallIds.has(toolCall.toolCallId)
        ) {
            continue;
        }

        const linkState = getRunSqlLinkStateFromArgs(toolCall.toolArgs);
        if (linkState) return linkState;
    }

    return null;
};

const SqlMarkdownCodeBlock: FC<
    CustomRendererProps & { projectUuid: string; canOpenSqlRunner: boolean }
> = ({ code, isIncomplete, projectUuid, canOpenSqlRunner }) => {
    const sql = code.trim();
    const canOpen = canOpenSqlRunner && !isIncomplete && sql.length > 0;

    return (
        <Box className={styles.sqlMarkdownCodeBlock}>
            <Group
                justify="space-between"
                align="center"
                gap="xs"
                className={styles.sqlMarkdownCodeHeader}
            >
                <Text size="xs" fw={600} c="dimmed">
                    SQL
                </Text>
                {canOpen ? (
                    <Button
                        component={Link}
                        to={{
                            pathname: `/projects/${projectUuid}/sql-runner`,
                        }}
                        state={{ sql }}
                        data-content-link="true"
                        size="compact-xs"
                        variant="default"
                        className={styles.sqlRunnerLinkButton}
                        leftSection={
                            <MantineIcon icon={IconTerminal2} size={12} />
                        }
                    >
                        Open in SQL Runner
                    </Button>
                ) : null}
            </Group>
            <Code block className={styles.sqlMarkdownCodeBody}>
                {code}
            </Code>
        </Box>
    );
};

const AssistantBubbleContent: FC<{
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
    mcpServers?: AiMcpServer[];
    onInternalLinkClick?: (href: string) => void;
}> = ({ message, projectUuid, agentUuid, mcpServers, onInternalLinkClick }) => {
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
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
    const streamingError = streamingState?.error;
    const runSqlTimeoutErrorMessage = getRunSqlTimeoutErrorMessage(message);
    const displayErrorMessage =
        runSqlTimeoutErrorMessage ||
        streamingError ||
        message.errorMessage ||
        'Failed to generate response. Please try again.';
    const displayErrorTitle = runSqlTimeoutErrorMessage
        ? 'SQL approval timed out'
        : 'Something went wrong';
    const sqlRunnerLinkState = getLatestSuccessfulRunSqlLinkState({
        message,
        streamParts: streamingState?.parts,
    });
    const canOpenSqlRunner = !!sqlRunnerLinkState;
    const markdownPlugins = useMemo(
        () => ({
            renderers: [
                {
                    language: ['sql', 'postgresql', 'bigquery', 'snowflake'],
                    component: (props: CustomRendererProps) => (
                        <SqlMarkdownCodeBlock
                            {...props}
                            projectUuid={projectUuid}
                            canOpenSqlRunner={canOpenSqlRunner}
                        />
                    ),
                },
            ],
        }),
        [canOpenSqlRunner, projectUuid],
    );
    const hasNoResponse =
        !isStreaming && !streamingError && !message.message && !isPending;
    const shouldShowRetry = hasError || hasNoResponse || !!streamingError;

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
        isToolProposeChangeResult,
    );
    const mcpUnavailableNotices = streamingState?.mcpUnavailableNotices ?? [];

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
                                    {displayErrorTitle}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {displayErrorMessage}
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

            {mcpUnavailableNotices.map((notice) => (
                <Box
                    key={notice.serverUuid}
                    className={styles.mcpUnavailableNotice}
                >
                    <Group
                        gap={8}
                        align="flex-start"
                        wrap="nowrap"
                        className={styles.mcpUnavailableNoticeHeader}
                    >
                        <Box className={styles.mcpUnavailableNoticeIconChip}>
                            <MantineIcon
                                icon={IconPlug}
                                size={12}
                                stroke={1.7}
                                className={styles.mcpUnavailableNoticeIcon}
                            />
                        </Box>
                        <Stack
                            gap={2}
                            className={styles.mcpUnavailableNoticeBody}
                        >
                            <Text
                                size="xs"
                                fw={500}
                                className={styles.mcpUnavailableNoticeLabel}
                            >
                                Couldn&apos;t connect to {notice.serverName}
                            </Text>
                            <Group gap={8} align="center" wrap="wrap">
                                <Text
                                    size="xs"
                                    className={
                                        styles.mcpUnavailableNoticeMessage
                                    }
                                >
                                    {canManageAgents
                                        ? 'Check connection settings.'
                                        : 'Reach out to an agent administrator to update this MCP connection.'}
                                </Text>
                                {canManageAgents && (
                                    <Button
                                        component={Link}
                                        to={`/projects/${projectUuid}/ai-agents/${agentUuid}/edit`}
                                        variant="subtle"
                                        color="gray"
                                        size="compact-xs"
                                        px={0}
                                        className={
                                            styles.mcpUnavailableNoticeAction
                                        }
                                    >
                                        Open settings
                                    </Button>
                                )}
                            </Group>
                        </Stack>
                    </Group>
                </Box>
            ))}

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
                    // bridges the gap between artifact landing and closing text.
                    const showFinishingUp =
                        isStreaming &&
                        !!message.artifacts?.length &&
                        segments[segments.length - 1]?.kind !== 'text';
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
                                plugins={markdownPlugins}
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
                                                sqlRunnerLinkState={
                                                    sqlRunnerLinkState
                                                }
                                                onInternalLinkClick={
                                                    onInternalLinkClick
                                                }
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
                                    toolCalls={message.toolCalls}
                                    mcpServers={mcpServers}
                                    pendingContent={pendingApprovalContent}
                                />
                            )}
                            {latestTextSeg ? (
                                <Box className={styles.streamPart}>
                                    {finalAnswerMd}
                                </Box>
                            ) : null}
                            {showFinishingUp && (
                                <TypingDots label="Finishing up" />
                            )}
                        </Stack>
                    );
                }

                // Fallback (page reload, no streamingState): activity card ON
                // TOP showing what the agent did + reasoning folded in, then
                // the final markdown answer below as the hero.
                const renderableToolCalls = message.toolCalls.filter(
                    (tc) =>
                        !HIDDEN_TOOL_NAMES.has(tc.toolName) &&
                        // Subagent children render nested under their parent's row, not as top-level siblings.
                        tc.parentToolCallId === null,
                );
                const persistedToolGroups: LiveActivityToolGroup[] =
                    groupPersistedToolCalls(renderableToolCalls);
                const persistedSqlApprovals =
                    getPendingPersistedSqlApprovals(message);
                const pendingApprovalContent =
                    persistedSqlApprovals.length > 0 ? (
                        <Stack gap={6}>
                            {persistedSqlApprovals.map((toolCall) => (
                                <SqlApprovalCard
                                    key={toolCall.toolCallId}
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                    threadUuid={message.threadUuid}
                                    toolCallId={toolCall.toolCallId}
                                    toolArgs={
                                        toolCall.toolArgs as {
                                            sql: string;
                                            limit?: number;
                                        }
                                    }
                                />
                            ))}
                        </Stack>
                    ) : null;
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
                                toolCalls={message.toolCalls}
                                mcpServers={mcpServers}
                                pendingContent={pendingApprovalContent}
                            />
                        )}
                        {persistedToolGroups.length === 0 &&
                            pendingApprovalContent && (
                                <LiveActivityCard
                                    toolGroups={[]}
                                    isLive={isStreaming || isPending}
                                    toolResults={message.toolResults}
                                    toolCalls={message.toolCalls}
                                    mcpServers={mcpServers}
                                    pendingContent={pendingApprovalContent}
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
                                    plugins={markdownPlugins}
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
                                                    sqlRunnerLinkState={
                                                        sqlRunnerLinkState
                                                    }
                                                    onInternalLinkClick={
                                                        onInternalLinkClick
                                                    }
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
            {(isStreaming || (isPending && !streamingError)) &&
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
    mcpServers?: AiMcpServer[];
    onInternalLinkClick?: (href: string) => void;
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
        mcpServers,
        onInternalLinkClick,
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

        // status flips to 'idle' only at stream end; artifacts land earlier.
        const isArtifactAvailable = !!(
            message.artifacts && message.artifacts.length > 0
        );

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
                    mcpServers={mcpServers}
                    onInternalLinkClick={onInternalLinkClick}
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
                                          const isThisArtifactOpen =
                                              artifact?.artifactUuid ===
                                                  messageArtifact.artifactUuid &&
                                              artifact?.versionUuid ===
                                                  messageArtifact.versionUuid;
                                          if (isThisArtifactOpen) {
                                              dispatch(clearArtifact());
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
                            totalTokens={message.tokenUsage?.totalTokens}
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
