import {
    interpolateUiString,
    type AiAgentToolResult,
    type AiAgentToolName,
    type AiMcpServer,
    isToolName,
    type ToolName,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconAlertCircle, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import { ToolCallDescription } from './descriptions/ToolCallDescription';
import { ToolCallChip } from './ToolCallChip';
import styles from './ToolCallRow.module.css';
import { ToolCallRowIcon } from './ToolCallRowIcon';
import { getToolCallChipLabel } from './utils/getToolCallChipLabel';
import { getToolCallDisplayMessage } from './utils/getToolCallDisplayMessage';
import {
    getMcpServerForToolName,
    getMcpToolDisplayMetadata,
    getMcpToolDisplayName,
} from './utils/mcpToolDisplay';
import { getToolCallFailures } from './utils/toolCallFailure';
import { type ToolCallGroupDisplay } from './utils/toolCallGrouping';
import { isToolWithoutDescription } from './utils/toolsWithoutDescription';
import { type ToolCallSummary } from './utils/types';

// Tools whose description renders something tall (e.g. a code block) and can't
// be sensibly clipped to a single-line preview — collapse to verb + chevron.
const HIDE_INLINE_PREVIEW = new Set<ToolName>([
    'query',
    'runComposerQueries',
    'runSql',
]);

const INLINE_CHIP_PREVIEW_TOOLS = new Set<ToolName>([
    'readContent',
    'editContent',
    'createContent',
]);

// Max chips shown inline when collapsed before "+N more".
const MAX_CHIPS_COLLAPSED = 3;

export type ToolCallRowStatus = 'running' | 'done' | 'error';

type Props = {
    toolName: AiAgentToolName;
    toolCalls: ToolCallSummary[];
    status?: ToolCallRowStatus;
    mcpServers?: AiMcpServer[];
    /**
     * Optional extra content rendered inside the expanded body, below the
     * per-call descriptions. Used to surface things like the discoverFields
     * subagent trace.
     */
    extraBody?: React.ReactNode;
    toolResults?: AiAgentToolResult[];
    display?: ToolCallGroupDisplay;
};

export const ToolCallRow: FC<Props> = ({
    toolName,
    toolCalls,
    status = 'done',
    mcpServers,
    extraBody,
    toolResults,
    display,
}) => {
    const getUiString = useUiStrings();
    const builtInToolName = isToolName(toolName) ? toolName : null;
    const linkedMcpServer =
        toolCalls.find((toolCall) => toolCall.mcpServer)?.mcpServer ??
        undefined;
    const mcpServer = builtInToolName
        ? undefined
        : (linkedMcpServer ?? getMcpServerForToolName(toolName, mcpServers));
    const mcpDisplayMetadata = builtInToolName
        ? undefined
        : getMcpToolDisplayMetadata(toolName, mcpServer);
    const mcpToolDisplayName = builtInToolName
        ? null
        : getMcpToolDisplayName(toolName);
    const label = builtInToolName
        ? getToolCallDisplayMessage({
              toolName: builtInToolName,
              calls: toolCalls,
              display,
              status: status === 'running' ? 'running' : 'done',
          })
        : null;
    const hasCallDescription = (toolCall: ToolCallSummary) =>
        isToolName(toolCall.toolName) &&
        !isToolWithoutDescription(toolCall.toolName);
    const hasDescription =
        toolCalls.some(hasCallDescription) || Boolean(extraBody);
    const isGrouped = toolCalls.length > 1;
    const [expanded, setExpanded] = useState(false);
    const failures = getToolCallFailures(toolCalls, toolResults);
    const effectiveStatus: ToolCallRowStatus =
        failures.length > 0 ? 'error' : status;
    const failureLabel = isGrouped
        ? interpolateUiString(getUiString('aiAgent.activity.partlyFailed'), {
              failed: failures.length,
              total: toolCalls.length,
          })
        : getUiString('aiAgent.activity.failed');

    const chipLabels: (string | null)[] = toolCalls.map((tc) =>
        isToolName(tc.toolName)
            ? getToolCallChipLabel(tc.toolName, tc.toolArgs)
            : null,
    );
    const visibleChips = chipLabels
        .map((c, idx) => ({ label: c, idx }))
        .filter((c): c is { label: string; idx: number } => Boolean(c.label));

    // The row is only clickable when expanding reveals something the user
    // can't already see in the inline head. Tools without descriptions just
    // show a count badge — no chevron, no click target.
    const isClickable = hasDescription;

    // What goes in the trailing single-line preview slot.
    const renderInlinePreview = (): React.ReactNode => {
        if (
            !isGrouped &&
            visibleChips.length > 0 &&
            isToolName(toolCalls[0].toolName) &&
            INLINE_CHIP_PREVIEW_TOOLS.has(toolCalls[0].toolName)
        ) {
            return (
                <Group gap={4} wrap="nowrap" className={styles.chips}>
                    <ToolCallChip className={styles.chipAppear}>
                        {visibleChips[0].label}
                    </ToolCallChip>
                </Group>
            );
        }

        if (
            !isGrouped &&
            hasDescription &&
            isToolName(toolCalls[0].toolName) &&
            !HIDE_INLINE_PREVIEW.has(toolCalls[0].toolName)
        ) {
            // Single call: show its description; clipped to one line by CSS.
            return (
                <Box className={styles.inlineDescription}>
                    <ToolCallDescription
                        toolName={toolCalls[0].toolName}
                        toolCall={toolCalls[0]}
                        toolResult={toolResults?.find(
                            (result) =>
                                result.toolCallId === toolCalls[0].toolCallId,
                        )}
                    />
                </Box>
            );
        }
        if (isGrouped && visibleChips.length > 0) {
            const shown = visibleChips.slice(0, MAX_CHIPS_COLLAPSED);
            const overflow = visibleChips.length - shown.length;
            return (
                <Group gap={4} wrap="nowrap" className={styles.chips}>
                    {shown.map(({ label: chipLabel, idx }) => (
                        <ToolCallChip
                            key={`chip-${idx}`}
                            className={styles.chipAppear}
                            style={{ '--chip-delay': `${idx * 28}ms` }}
                        >
                            {chipLabel}
                        </ToolCallChip>
                    ))}
                    {overflow > 0 && (
                        <Text size="xs" c="dimmed" className={styles.overflow}>
                            +{overflow}
                        </Text>
                    )}
                </Group>
            );
        }
        // Grouped tools without chips just rely on the badge next to the
        // label; no extra trailing slot content.
        return null;
    };

    const head = (
        <Group gap={8} align="center" wrap="nowrap" className={styles.head}>
            {effectiveStatus === 'error' ? (
                <MantineIcon
                    icon={IconAlertCircle}
                    size={14}
                    stroke={1.6}
                    className={styles.icon}
                    data-status="error"
                    aria-hidden
                />
            ) : (
                <ToolCallRowIcon
                    toolName={toolName}
                    toolCalls={toolCalls}
                    size={14}
                    stroke={1.6}
                    className={styles.icon}
                    mcpServer={mcpServer}
                    data-status={effectiveStatus}
                />
            )}
            {label ? (
                <Text size="sm" className={styles.label}>
                    {label}
                </Text>
            ) : (
                <Text size="sm" className={styles.label}>
                    Used {mcpDisplayMetadata?.label ?? 'MCP'}:{' '}
                    <ToolCallChip maxWidth={260} className={styles.mcpToolChip}>
                        {mcpToolDisplayName}
                    </ToolCallChip>
                </Text>
            )}
            {isGrouped && (
                <Box className={styles.countBadge}>{toolCalls.length}</Box>
            )}
            {failures.length > 0 && (
                <Text size="xs" className={styles.failedLabel}>
                    {failureLabel}
                </Text>
            )}
            <Box className={styles.previewSlot}>{renderInlinePreview()}</Box>
            {isClickable && (
                <MantineIcon
                    icon={IconChevronRight}
                    size={11}
                    stroke={1.6}
                    className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
                />
            )}
        </Group>
    );

    const failureDetails = failures.filter((failure) => failure.message !== '');
    const failureMessages =
        failureDetails.length > 0 ? (
            <Stack gap={2} className={styles.failureMessages}>
                {failureDetails.map((failure) => (
                    <Text
                        key={failure.toolCallId}
                        size="xs"
                        ff="monospace"
                        lineClamp={2}
                        className={styles.failureMessage}
                        title={failure.message}
                    >
                        {failure.message}
                    </Text>
                ))}
            </Stack>
        ) : null;

    if (!isClickable) {
        return (
            <Box className={styles.row} data-status={effectiveStatus}>
                {head}
                {failureMessages}
            </Box>
        );
    }

    return (
        <Box
            className={styles.row}
            data-expanded={expanded}
            data-status={effectiveStatus}
        >
            <UnstyledButton
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                w="100%"
                className={styles.rowButton}
            >
                {head}
            </UnstyledButton>
            {failureMessages}
            <Collapse
                expanded={expanded}
                transitionDuration={240}
                transitionTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
            >
                <Stack gap={4} className={styles.body}>
                    {toolCalls.map((tc) =>
                        isToolName(tc.toolName) ? (
                            <ToolCallDescription
                                key={tc.toolCallId}
                                toolName={tc.toolName}
                                toolCall={tc}
                                toolResult={toolResults?.find(
                                    (result) =>
                                        result.toolCallId === tc.toolCallId,
                                )}
                            />
                        ) : null,
                    )}
                    {extraBody}
                </Stack>
            </Collapse>
        </Box>
    );
};
