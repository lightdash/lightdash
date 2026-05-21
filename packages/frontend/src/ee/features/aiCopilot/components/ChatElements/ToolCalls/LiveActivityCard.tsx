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
};

const REASONING_PREVIEW_LENGTH = 140;

const TOOLS_WITHOUT_PREVIEW = new Set<string>([
    'runSql',
    'improveContext',
    'proposeChange',
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
                        Using MCP {mcpDisplayMetadata?.label ?? 'MCP'}:
                    </Text>
                    <ToolCallChip
                        maxWidth={260}
                        className={styles.latestMcpToolChip}
                    >
                        {group.toolName}
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

const extractTraceFromMessage = (
    message: StreamingMessage | undefined,
): TraceEntry[] | null => {
    if (!message) return null;
    const entries: TraceEntry[] = [];
    for (const part of message.parts) {
        if (
            part.type !== 'tool-findExplores' &&
            part.type !== 'tool-findFields'
        ) {
            continue;
        }
        if (!part.toolCallId) continue;
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
    const fromMessage = extractTraceFromMessage(metadata?.streamingMessage);
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
    return extractTraceFromMessage(output?.metadata?.streamingMessage);
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
            <Collapse
                in={showBody}
                transitionDuration={260}
                transitionTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
            >
                <Stack gap={6} className={styles.history}>
                    {hasPending && (
                        <Box className={styles.pending}>{pendingContent}</Box>
                    )}
                    {latest && !hasPending && (
                        <Stack gap={4}>
                            {(() => {
                                const latestBuiltInToolName = isToolName(
                                    latest.toolName,
                                )
                                    ? latest.toolName
                                    : null;

                                return latestBuiltInToolName
                                    ? latest.calls.map((tc) => {
                                          const trace =
                                              latestBuiltInToolName ===
                                              'discoverFields'
                                                  ? (getDiscoverFieldsTraceFromCall(
                                                        tc,
                                                    ) ??
                                                    getDiscoverFieldsTrace(
                                                        toolResults?.find(
                                                            (r) =>
                                                                r.toolCallId ===
                                                                tc.toolCallId,
                                                        ),
                                                        toolCalls,
                                                    ))
                                                  : null;

                                          return (
                                              <Box
                                                  key={tc.toolCallId}
                                                  className={
                                                      styles.latestDescription
                                                  }
                                              >
                                                  <ToolCallDescription
                                                      toolName={
                                                          latestBuiltInToolName
                                                      }
                                                      toolCall={tc}
                                                      toolResult={toolResults?.find(
                                                          (result) =>
                                                              result.toolCallId ===
                                                              tc.toolCallId,
                                                      )}
                                                  />
                                                  {trace && (
                                                      <DiscoverFieldsTrace
                                                          trace={trace}
                                                      />
                                                  )}
                                              </Box>
                                          );
                                      })
                                    : null;
                            })()}
                        </Stack>
                    )}
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
