import {
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type AiAgentToolCall,
    type AiAgentToolName,
    type AiAgentToolResult,
    type AiMcpServer,
    isToolName,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { IconChevronRight, IconNotes } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { type StepProgressMessage } from '../../../store/aiAgentThreadStreamSlice';
import bubbleStyles from '../AgentChatAssistantBubble.module.css';
import { ToolCallDescription } from './descriptions/ToolCallDescription';
import { DiscoverFieldsTrace, type TraceEntry } from './DiscoverFieldsTrace';
import styles from './LiveActivityCard.module.css';
import { ToolCallChip } from './ToolCallChip';
import { ToolCallIcon } from './ToolCallIcon';
import { ToolCallRow } from './ToolCallRow';
import { getActivityTitle } from './utils/getActivityTitle';
import { getToolCallChipLabel } from './utils/getToolCallChipLabel';
import {
    getMcpServerForToolName,
    getMcpToolDisplayMetadata,
    getMcpToolDisplayName,
} from './utils/mcpToolDisplay';
import { stripMarkdown } from './utils/stripMarkdown';
import { getToolIcon } from './utils/toolIcons';
import { type ToolCallSummary } from './utils/types';

export type LiveActivityToolGroup = {
    toolName: AiAgentToolName;
    calls: ToolCallSummary[];
    keyId: string;
};

type Props = {
    toolGroups: LiveActivityToolGroup[];
    isLive: boolean;
    /**
     * Tool results keyed by toolCallId. Used to surface optional extras
     * inline with the call (e.g. the discoverFields subagent's internal
     * trace renders below the parent row).
     */
    toolResults?: AiAgentToolResult[];
    /** All tool calls for the message. Used to resolve subagent children via parentToolCallId. */
    toolCalls?: AiAgentToolCall[];
    mcpServers?: AiMcpServer[];
    /**
     * Pending interactive content (e.g. SqlApprovalCard awaiting user
     * decision). When present, the card auto-expands and renders this in the
     * body at the top — used so SQL approval lives inside the bento instead
     * of as a separate floating card.
     */
    pendingContent?: React.ReactNode;
    /**
     * In-flight status events emitted across the stream (e.g. "Starting
     * sandbox", "Cloning project", "Committing changes" for proposeWriteback).
     * Each carries the tool it belongs to so the inline row can be scoped to
     * the active tool — a concurrently running tool's progress (e.g. a
     * `findFields` query fired alongside the writeback) must not surface under
     * the writeback header. Latest matching entry is shown as a single
     * replacing row. Empty when no tool has fired a progress event yet.
     */
    stepProgressMessages?: StepProgressMessage[];
};

const REASONING_PREVIEW_LENGTH = 140;

const TOOLS_WITHOUT_PREVIEW = new Set<string>([
    'runSql',
    'improveContext',
    'proposeChange',
    'runContentQuery',
    'runSavedChart',
]);

// Built-in tools whose ToolCallDescription returns an empty fragment.
// Listing them lets the latest-description Box opt out entirely, instead
// of rendering an empty wrapper that animates an empty area open/closed
// when the user expands the card. Keep this in sync with the empty cases
// in ToolCallDescription.tsx — discoverFields is intentionally excluded
// because it has no description string but does render a subagent trace.
const TOOLS_WITHOUT_LATEST_DESCRIPTION = new Set<string>([
    'listKnowledgeDocuments',
    'listProjects',
    'getProjectInfo',
    'listContent',
    'generateUuids',
    'improveContext',
    'loadSkill',
    'proposeChange',
    'proposeWriteback',
    'runContentQuery',
    'runSavedChart',
]);

const MCP_SUMMARY_ICON_LIMIT = 4;

const getMcpSummaryIcons = (
    toolGroups: LiveActivityToolGroup[],
    mcpServers?: AiMcpServer[],
) => {
    const seen = new Set<string>();

    return toolGroups.flatMap((group) => {
        if (isToolName(group.toolName)) return [];

        const linkedMcpServer =
            group.calls.find((toolCall) => toolCall.mcpServer)?.mcpServer ??
            undefined;
        const mcpServer =
            linkedMcpServer ??
            getMcpServerForToolName(group.toolName, mcpServers);
        const metadata = getMcpToolDisplayMetadata(group.toolName, mcpServer);
        const key = mcpServer?.uuid ?? metadata.label;

        if (seen.has(key)) return [];
        seen.add(key);

        return [{ toolName: group.toolName, mcpServer, key }];
    });
};

const McpSummaryIconStack: FC<{
    toolGroups: LiveActivityToolGroup[];
    mcpServers?: AiMcpServer[];
}> = ({ toolGroups, mcpServers }) => {
    const icons = getMcpSummaryIcons(toolGroups, mcpServers);
    if (icons.length === 0) return null;

    const visibleIcons = icons.slice(0, MCP_SUMMARY_ICON_LIMIT);
    const overflow = icons.length - visibleIcons.length;

    return (
        <Group gap={0} wrap="nowrap" className={styles.mcpSummaryIconStack}>
            {visibleIcons.map((icon, idx) => (
                <ToolCallIcon
                    key={icon.key}
                    toolName={icon.toolName}
                    mcpServer={icon.mcpServer}
                    className={styles.mcpSummaryIcon}
                    style={
                        {
                            '--mcp-summary-icon-z-index':
                                visibleIcons.length - idx,
                        } as React.CSSProperties
                    }
                />
            ))}
            {overflow > 0 && (
                <Box className={styles.mcpSummaryOverflow}>+{overflow}</Box>
            )}
        </Group>
    );
};

export const ReasoningHistoryRow: FC<{
    texts: string[];
    isLive: boolean;
}> = ({ texts, isLive }) => {
    const [open, setOpen] = useState(false);
    const combined = texts.join('\n\n');
    // While streaming, the preview is the *latest* reasoning chunk (it rolls
    // forward as the agent produces new thoughts). Once persisted, we just
    // show the start of the combined text. We strip markdown syntax so the
    // single-line preview doesn't show raw `###` / `**` etc.
    const previewSource = isLive ? (texts[texts.length - 1] ?? '') : combined;
    const previewClean = stripMarkdown(previewSource);
    const preview = previewClean.slice(0, REASONING_PREVIEW_LENGTH);
    const hasOverflow = previewClean.length > REASONING_PREVIEW_LENGTH;

    return (
        <Box className={styles.reasoningRow}>
            <UnstyledButton
                w="100%"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                className={styles.reasoningHeader}
            >
                <Group gap={8} align="center" wrap="nowrap">
                    {isLive ? (
                        <Box className={styles.iconChip} data-live="true">
                            <MantineIcon
                                icon={IconNotes}
                                size={12}
                                stroke={1.7}
                                className={styles.reasoningIcon}
                                data-live="true"
                            />
                        </Box>
                    ) : (
                        <MantineIcon
                            icon={IconNotes}
                            size={13}
                            stroke={1.6}
                            className={styles.reasoningIcon}
                        />
                    )}
                    <Text
                        size="xs"
                        className={styles.reasoningLabel}
                        data-live={isLive ? 'true' : 'false'}
                    >
                        Reasoning
                    </Text>
                    <Text
                        size="xs"
                        c="dimmed"
                        lineClamp={1}
                        fs="italic"
                        className={styles.reasoningPreview}
                    >
                        {preview}
                        {hasOverflow ? '…' : ''}
                    </Text>
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                    />
                </Group>
            </UnstyledButton>
            <Collapse
                in={open}
                transitionDuration={240}
                transitionTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
            >
                <Box
                    className={`${styles.reasoningBody} ${bubbleStyles.aiMarkdown}`}
                    style={{
                        fontStyle: 'italic',
                        color: 'var(--mantine-color-ldGray-7)',
                    }}
                >
                    <Streamdown
                        parseIncompleteMarkdown
                        controls={false}
                        mode="static"
                        remarkPlugins={[remarkGfm, remarkEmoji]}
                    >
                        {combined}
                    </Streamdown>
                </Box>
            </Collapse>
        </Box>
    );
};

const LatestRow: FC<{
    group: LiveActivityToolGroup;
    isLive: boolean;
    mcpServers?: AiMcpServer[];
}> = ({ group, isLive, mcpServers }) => {
    const builtInToolName = isToolName(group.toolName) ? group.toolName : null;
    const linkedMcpServer =
        group.calls.find((toolCall) => toolCall.mcpServer)?.mcpServer ??
        undefined;
    const mcpServer = builtInToolName
        ? undefined
        : (linkedMcpServer ??
          getMcpServerForToolName(group.toolName, mcpServers));
    const mcpDisplayMetadata = builtInToolName
        ? undefined
        : getMcpToolDisplayMetadata(group.toolName, mcpServer);
    const mcpToolDisplayName = builtInToolName
        ? null
        : getMcpToolDisplayName(group.toolName);
    const label = builtInToolName
        ? isLive
            ? TOOL_DISPLAY_MESSAGES[builtInToolName]
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[builtInToolName]
        : null;
    const isGrouped = group.calls.length > 1;
    const lastCall = group.calls[group.calls.length - 1];
    const chipLabel = isToolName(group.toolName)
        ? getToolCallChipLabel(group.toolName, lastCall.toolArgs)
        : null;
    const showPreview = chipLabel && !TOOLS_WITHOUT_PREVIEW.has(group.toolName);

    return (
        <Group
            gap={8}
            align="center"
            wrap="nowrap"
            className={styles.latestRow}
            data-live={isLive ? 'true' : 'false'}
        >
            {/* Keying icon + label by toolName makes them remount with a
             *  subtle settle-in animation each time the active tool changes,
             *  so the swap reads as a deliberate transition rather than a
             *  text flicker. The icon sits inside a small rounded "logo"
             *  chip for visual weight. */}
            <Box className={styles.iconSwap} key={`icon-${group.toolName}`}>
                <Box
                    className={styles.iconChip}
                    data-live={isLive ? 'true' : 'false'}
                >
                    <ToolCallIcon
                        toolName={group.toolName}
                        size={12}
                        stroke={1.7}
                        className={styles.latestIcon}
                        mcpServer={mcpServer}
                        data-live={isLive ? 'true' : 'false'}
                    />
                </Box>
            </Box>
            {label ? (
                <Text
                    size="xs"
                    className={styles.latestLabel}
                    key={`label-${group.toolName}-${isLive ? 'live' : 'done'}`}
                >
                    {label}
                </Text>
            ) : (
                <Group
                    gap={4}
                    wrap="nowrap"
                    className={styles.latestMcpLabel}
                    key={`label-${group.toolName}-${isLive ? 'live' : 'done'}`}
                >
                    <Text size="xs" className={styles.latestLabel}>
                        Using {mcpDisplayMetadata?.label ?? 'MCP'}:
                    </Text>
                    <ToolCallChip
                        maxWidth={260}
                        className={styles.latestMcpToolChip}
                    >
                        {mcpToolDisplayName}
                    </ToolCallChip>
                </Group>
            )}
            {isGrouped && (
                <Box
                    className={styles.countBadge}
                    key={`count-${group.calls.length}`}
                >
                    {group.calls.length}
                </Box>
            )}
            {showPreview && chipLabel && (
                <Text
                    size="xs"
                    c="dimmed"
                    lineClamp={1}
                    className={styles.latestPreview}
                    key={`preview-${chipLabel}`}
                >
                    {chipLabel}
                </Text>
            )}
        </Group>
    );
};

/**
 * Subagent UIMessage as carried inside the discoverFields tool's output:
 * `output.metadata.streamingMessage` during preliminary streaming and on the
 * final non-preliminary result that lands in `AiAgentToolResult.metadata`.
 */
type StreamingMessage = {
    parts: ReadonlyArray<{
        type: string;
        toolCallId?: string;
        input?: unknown;
    }>;
};

type DiscoverFieldsOutputMetadata = {
    streamingMessage?: StreamingMessage;
    /**
     * Legacy: pre-streaming trial wrote findExplores/findFields entries
     * directly to metadata.trace. Kept as a fallback so threads created
     * before the streaming switchover still nest correctly on reload.
     */
    trace?: TraceEntry[];
};

const extractDiscoverFieldsTraceFromStreamingMessage = (
    message: StreamingMessage | undefined,
): TraceEntry[] | null => {
    if (!message) return null;
    const entries: TraceEntry[] = [];
    const seenToolCallIds = new Set<string>();
    for (const part of message.parts) {
        if (
            part.type !== 'tool-findExplores' &&
            part.type !== 'tool-findFields'
        ) {
            continue;
        }
        if (!part.toolCallId) continue;
        if (seenToolCallIds.has(part.toolCallId)) continue;
        seenToolCallIds.add(part.toolCallId);
        entries.push({
            toolCallId: part.toolCallId,
            toolName:
                part.type === 'tool-findExplores'
                    ? 'findExplores'
                    : 'findFields',
            toolArgs: part.input ?? {},
        });
    }
    return entries.length > 0 ? entries : null;
};

const extractTraceFromChildren = (
    parentToolCallId: string,
    allToolCalls: AiAgentToolCall[] | undefined,
): TraceEntry[] | null => {
    if (!allToolCalls) return null;
    const children = allToolCalls.filter(
        (tc) =>
            tc.parentToolCallId === parentToolCallId &&
            (tc.toolName === 'findExplores' || tc.toolName === 'findFields'),
    );
    if (children.length === 0) return null;
    return children.map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName as 'findExplores' | 'findFields',
        toolArgs: tc.toolArgs,
    }));
};

const getDiscoverFieldsTrace = (
    toolResult: AiAgentToolResult | undefined,
    allToolCalls?: AiAgentToolCall[],
): TraceEntry[] | null => {
    if (!toolResult || toolResult.toolName !== 'discoverFields') return null;
    const fromFk = extractTraceFromChildren(
        toolResult.toolCallId,
        allToolCalls,
    );
    if (fromFk) return fromFk;
    const metadata = toolResult.metadata as
        | DiscoverFieldsOutputMetadata
        | undefined;
    const fromMessage = extractDiscoverFieldsTraceFromStreamingMessage(
        metadata?.streamingMessage,
    );
    if (fromMessage) return fromMessage;
    const legacy = metadata?.trace;
    return Array.isArray(legacy) && legacy.length > 0 ? legacy : null;
};

/**
 * Pulls the trace out of a live discoverFields tool call's preliminary
 * output. Source of truth during streaming, while the subagent is still
 * emitting findExplores/findFields parts and before the result lands in
 * AiAgentToolResult.metadata.
 */
const getDiscoverFieldsTraceFromCall = (
    call: ToolCallSummary,
): TraceEntry[] | null => {
    if (call.toolName !== 'discoverFields') return null;
    const output = call.toolOutput as
        | { metadata?: DiscoverFieldsOutputMetadata }
        | undefined;
    return extractDiscoverFieldsTraceFromStreamingMessage(
        output?.metadata?.streamingMessage,
    );
};

/**
 * Render the latest tool's progress as a single inline row under the
 * card header — the label gets replaced (rather than stacked) as the tool
 * advances. Matches the Slack experience where one pinned line is
 * overwritten with each new stage, without losing the visual anchor of a
 * pulsing dot.
 *
 * Returns null when there's nothing to render (the tool hasn't fired any
 * progress events, an SQL approval is pending, or we're not actively
 * streaming). Today only proposeWriteback emits progress strings that
 * warrant this treatment; other tools either run instantly or share the
 * single "Running your query…" string that the parent bubble shows via
 * TypingDots instead.
 *
 * Crucially, the row shows only the latest event belonging to the active
 * tool (`toolName === latest.toolName`). A writeback often runs alongside
 * other tools (e.g. a `findFields` query the agent fired in the same turn),
 * and all of their progress lands in one flat list — without this scoping a
 * concurrent tool's "Searching for fields…" would briefly surface under the
 * "Opening a pull request" header.
 */
const renderInlineLiveStepProgress = (params: {
    latest: LiveActivityToolGroup | null;
    isLive: boolean;
    hasPending: boolean;
    stepProgressMessages: StepProgressMessage[];
}): React.ReactNode => {
    const { latest, isLive, hasPending, stepProgressMessages } = params;
    if (!isLive || !latest || hasPending) return null;
    if (latest.toolName !== 'proposeWriteback') return null;

    const currentMessage = stepProgressMessages
        .filter((m) => m.toolName === latest.toolName)
        .at(-1)?.message;
    if (!currentMessage) return null;

    return (
        <Box className={styles.liveStepProgress}>
            <Group
                gap={6}
                align="center"
                wrap="nowrap"
                className={styles.liveStepProgressRow}
                // Key on the message so React swaps the node (replays the
                // fade-in animation) each time a new progress event lands,
                // rather than just rewriting the text in place. Reads as a
                // deliberate "next step" rather than a silent label change.
                key={currentMessage}
                data-active="true"
            >
                <Box
                    className={styles.liveStepProgressDot}
                    data-active="true"
                />
                <Text
                    size="xs"
                    className={styles.liveStepProgressLabel}
                    data-active="true"
                >
                    {currentMessage}
                </Text>
            </Group>
        </Box>
    );
};

/**
 * Render the subagent's live trace outside the activity card's collapse
 * so users see findExplores / findFields rows appear under the
 * "Discovering fields" header without having to expand the card.
 *
 * Returns null when there's nothing to render (no live tool, the latest
 * isn't discoverFields, an SQL approval is pending, or no trace entries
 * have landed yet). Today this is discoverFields-only; if a second
 * streaming tool wants the same UX, lift the toolName check into a
 * registration map.
 */
const renderInlineLiveTrace = (params: {
    latest: LiveActivityToolGroup | null;
    isLive: boolean;
    hasPending: boolean;
}): React.ReactNode => {
    const { latest, isLive, hasPending } = params;
    if (!isLive || !latest || hasPending) return null;
    if (latest.toolName !== 'discoverFields') return null;
    const trace = latest.calls
        .map((tc) => getDiscoverFieldsTraceFromCall(tc))
        .find((t) => t && t.length > 0);
    if (!trace) return null;
    return (
        <Box className={styles.liveTrace}>
            <DiscoverFieldsTrace trace={trace} />
        </Box>
    );
};

export const LiveActivityCard: FC<Props> = ({
    toolGroups,
    isLive,
    toolResults,
    toolCalls,
    mcpServers,
    pendingContent,
    stepProgressMessages = [],
}) => {
    const [userExpanded, setUserExpanded] = useState(false);

    // When the latest tool changes, auto-expand for runSql (so users see the
    // query immediately) and auto-collapse otherwise. The user's explicit
    // toggle is reset on every tool change so the bento has fresh "default
    // state" for each new step.
    const latestKeyId =
        toolGroups.length > 0
            ? toolGroups[toolGroups.length - 1].keyId
            : undefined;
    const latestToolName =
        toolGroups.length > 0
            ? toolGroups[toolGroups.length - 1].toolName
            : undefined;
    useEffect(() => {
        if (latestToolName === 'runSql') setUserExpanded(true);
        else setUserExpanded(false);
    }, [latestKeyId, latestToolName]);

    if (toolGroups.length === 0 && !pendingContent) return null;

    const hasPending = pendingContent != null;
    // When there's a pending approval, the conceptual *latest* action is the
    // SQL waiting on the user — not the last completed tool. We surface a
    // dedicated "Running SQL query" header and push all completed tools into
    // the history. After streaming the header is a *summary title* rather
    // than the latest row, so every tool group (including the last) belongs
    // in the expandable body so its description (e.g. SQL) stays reachable.
    const showSummaryHeader = !isLive && toolGroups.length > 0;
    const latest =
        hasPending || showSummaryHeader || toolGroups.length === 0
            ? null
            : toolGroups[toolGroups.length - 1];
    const totalCalls = toolGroups.reduce(
        (sum, group) => sum + group.calls.length,
        0,
    );
    const olderGroups = latest ? toolGroups.slice(0, -1) : toolGroups;
    const olderCount = latest ? totalCalls - latest.calls.length : totalCalls;
    const hasHistory = olderCount > 0;
    // Auto-expand whenever there's pending interactive content so the user
    // sees it immediately, without needing to click the chevron.
    const expanded = hasPending || userExpanded;

    const latestNeedsExpandedBody = latest?.toolName === 'runSql';
    const showBody =
        expanded && (hasHistory || hasPending || latestNeedsExpandedBody);

    return (
        <Box
            className={styles.card}
            data-live={isLive ? 'true' : 'false'}
            data-expanded={expanded ? 'true' : 'false'}
        >
            <UnstyledButton
                w="100%"
                onClick={() => setUserExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className={styles.header}
                disabled={
                    !hasHistory && !hasPending && !latestNeedsExpandedBody
                }
            >
                <Group gap={6} align="center" wrap="nowrap">
                    <Box className={styles.latestSlot}>
                        {showSummaryHeader ? (
                            (() => {
                                const summary = getActivityTitle(toolGroups);
                                const SummaryIcon = summary.icon;
                                return (
                                    <Group
                                        gap={8}
                                        align="center"
                                        wrap="nowrap"
                                        className={styles.latestRow}
                                    >
                                        <MantineIcon
                                            icon={SummaryIcon}
                                            size={13}
                                            stroke={1.6}
                                            className={styles.latestIcon}
                                        />
                                        <Text
                                            size="xs"
                                            className={styles.latestLabel}
                                        >
                                            {summary.title}
                                        </Text>
                                        <McpSummaryIconStack
                                            toolGroups={toolGroups}
                                            mcpServers={mcpServers}
                                        />
                                    </Group>
                                );
                            })()
                        ) : latest ? (
                            <LatestRow
                                group={latest}
                                isLive={isLive}
                                mcpServers={mcpServers}
                            />
                        ) : hasPending ? (
                            <Group
                                gap={8}
                                align="center"
                                wrap="nowrap"
                                className={styles.latestRow}
                            >
                                <MantineIcon
                                    icon={getToolIcon('runSql')}
                                    size={13}
                                    stroke={1.6}
                                    className={styles.latestIcon}
                                    data-live="true"
                                />
                                <Text
                                    size="xs"
                                    className={styles.latestLabel}
                                    data-live="true"
                                >
                                    Running SQL query
                                </Text>
                                <Text
                                    size="xs"
                                    c="dimmed"
                                    className={styles.latestPreview}
                                >
                                    awaiting approval
                                </Text>
                            </Group>
                        ) : null}
                    </Box>
                    {olderCount > 0 && (
                        <Text size="xs" className={styles.counter}>
                            +{olderCount}
                        </Text>
                    )}
                    {(hasHistory || hasPending || latestNeedsExpandedBody) && (
                        <MantineIcon
                            icon={IconChevronRight}
                            size={11}
                            stroke={1.6}
                            className={`${styles.chevron} ${
                                expanded ? styles.chevronOpen : ''
                            }`}
                        />
                    )}
                </Group>
            </UnstyledButton>
            {renderInlineLiveTrace({ latest, isLive, hasPending })}
            {renderInlineLiveStepProgress({
                latest,
                isLive,
                hasPending,
                stepProgressMessages,
            })}
            <Collapse
                in={showBody}
                transitionDuration={260}
                transitionTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
            >
                <Stack gap={6} className={styles.history}>
                    {hasPending && (
                        <Box className={styles.pending}>{pendingContent}</Box>
                    )}
                    {(() => {
                        if (!latest || hasPending) return null;
                        const latestBuiltInToolName = isToolName(
                            latest.toolName,
                        )
                            ? latest.toolName
                            : null;
                        if (!latestBuiltInToolName) return null;

                        const hasNoDescription =
                            TOOLS_WITHOUT_LATEST_DESCRIPTION.has(
                                latestBuiltInToolName,
                            );
                        const renderableCalls = latest.calls
                            .map((tc) => {
                                const trace =
                                    latestBuiltInToolName === 'discoverFields'
                                        ? (getDiscoverFieldsTraceFromCall(tc) ??
                                          getDiscoverFieldsTrace(
                                              toolResults?.find(
                                                  (r) =>
                                                      r.toolCallId ===
                                                      tc.toolCallId,
                                              ),
                                              toolCalls,
                                          ))
                                        : null;
                                // Skip the wrapper entirely when there's
                                // nothing to show, otherwise expanding the
                                // card animates an empty box open/closed.
                                if (hasNoDescription && !trace) return null;
                                return (
                                    <Box
                                        key={tc.toolCallId}
                                        className={styles.latestDescription}
                                    >
                                        {!hasNoDescription && (
                                            <ToolCallDescription
                                                toolName={latestBuiltInToolName}
                                                toolCall={tc}
                                                toolResult={toolResults?.find(
                                                    (result) =>
                                                        result.toolCallId ===
                                                        tc.toolCallId,
                                                )}
                                            />
                                        )}
                                        {trace && (
                                            <DiscoverFieldsTrace
                                                trace={trace}
                                            />
                                        )}
                                    </Box>
                                );
                            })
                            .filter((node) => node !== null);
                        if (renderableCalls.length === 0) return null;
                        return <Stack gap={4}>{renderableCalls}</Stack>;
                    })()}
                    {olderGroups.length > 0 && (
                        <Stack gap={2}>
                            {olderGroups.map((group, idx) => {
                                const groupTrace =
                                    group.toolName === 'discoverFields'
                                        ? group.calls
                                              .map(
                                                  (tc) =>
                                                      getDiscoverFieldsTraceFromCall(
                                                          tc,
                                                      ) ??
                                                      getDiscoverFieldsTrace(
                                                          toolResults?.find(
                                                              (r) =>
                                                                  r.toolCallId ===
                                                                  tc.toolCallId,
                                                          ),
                                                          toolCalls,
                                                      ),
                                              )
                                              .find((t) => t && t.length > 0)
                                        : null;
                                return (
                                    <Box
                                        key={group.keyId}
                                        className={styles.historyRow}
                                        style={
                                            {
                                                '--row-delay': `${idx * 28}ms`,
                                            } as React.CSSProperties
                                        }
                                    >
                                        <ToolCallRow
                                            toolName={group.toolName}
                                            toolCalls={group.calls}
                                            status="done"
                                            toolResults={toolResults}
                                            mcpServers={mcpServers}
                                            extraBody={
                                                groupTrace ? (
                                                    <DiscoverFieldsTrace
                                                        trace={groupTrace}
                                                    />
                                                ) : undefined
                                            }
                                        />
                                    </Box>
                                );
                            })}
                        </Stack>
                    )}
                </Stack>
            </Collapse>
        </Box>
    );
};
