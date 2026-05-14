import {
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type ToolName,
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
import styles from './LiveActivityCard.module.css';
import { ToolCallRow } from './ToolCallRow';
import { getActivityTitle } from './utils/getActivityTitle';
import { getToolCallChipLabel } from './utils/getToolCallChipLabel';
import { stripMarkdown } from './utils/stripMarkdown';
import { getToolIcon } from './utils/toolIcons';
import { type ToolCallSummary } from './utils/types';

export type LiveActivityToolGroup = {
    toolName: ToolName;
    calls: ToolCallSummary[];
    keyId: string;
};

type Props = {
    toolGroups: LiveActivityToolGroup[];
    isLive: boolean;
    /**
     * Pending interactive content (e.g. SqlApprovalCard awaiting user
     * decision). When present, the card auto-expands and renders this in the
     * body at the top — used so SQL approval lives inside the bento instead
     * of as a separate floating card.
     */
    pendingContent?: React.ReactNode;
};

const REASONING_PREVIEW_LENGTH = 140;

const TOOLS_WITHOUT_PREVIEW = new Set<ToolName>([
    'runSql',
    'improveContext',
    'proposeChange',
    'runSavedChart',
    'listWarehouseTables',
    'describeWarehouseTable',
]);

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
                        className={`${styles.chevron} ${
                            open ? styles.chevronOpen : ''
                        }`}
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

const LatestRow: FC<{ group: LiveActivityToolGroup; isLive: boolean }> = ({
    group,
    isLive,
}) => {
    const Icon = getToolIcon(group.toolName);
    const label = isLive
        ? TOOL_DISPLAY_MESSAGES[group.toolName]
        : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[group.toolName];
    const isGrouped = group.calls.length > 1;
    const lastCall = group.calls[group.calls.length - 1];
    const chipLabel = getToolCallChipLabel(group.toolName, lastCall.toolArgs);
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
                    <MantineIcon
                        icon={Icon}
                        size={12}
                        stroke={1.7}
                        className={styles.latestIcon}
                        data-live={isLive ? 'true' : 'false'}
                    />
                </Box>
            </Box>
            <Text
                size="xs"
                className={styles.latestLabel}
                key={`label-${group.toolName}-${isLive ? 'live' : 'done'}`}
            >
                {label}
            </Text>
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

export const LiveActivityCard: FC<Props> = ({
    toolGroups,
    isLive,
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

    const showBody = expanded && (hasHistory || hasPending);

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
                disabled={!hasHistory && !hasPending}
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
                                    </Group>
                                );
                            })()
                        ) : latest ? (
                            <LatestRow group={latest} isLive={isLive} />
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
                    {(hasHistory || hasPending) && (
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
                            {latest.calls.map((tc) => (
                                <Box
                                    key={tc.toolCallId}
                                    className={styles.latestDescription}
                                >
                                    <ToolCallDescription
                                        toolName={latest.toolName}
                                        toolCall={tc}
                                    />
                                </Box>
                            ))}
                        </Stack>
                    )}
                    {olderGroups.length > 0 && (
                        <Stack gap={2}>
                            {olderGroups.map((group, idx) => (
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
                                    />
                                </Box>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </Collapse>
        </Box>
    );
};
