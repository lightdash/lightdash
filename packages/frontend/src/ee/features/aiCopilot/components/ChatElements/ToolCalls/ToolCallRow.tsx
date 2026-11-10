import {
    type AiAgentToolResult,
    type AiAgentToolName,
    type AiMcpServer,
    isToolName,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
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
import { type ToolCallGroupDisplay } from './utils/toolCallGrouping';
import { isToolWithoutDescription } from './utils/toolsWithoutDescription';
import { type ToolCallSummary } from './utils/types';

// Max chips shown inline when collapsed before "+N more".
const MAX_CHIPS_COLLAPSED = 3;

export type ToolCallRowStatus = 'running' | 'done';

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
              status,
          })
        : null;
    const hasCallDescription = (toolCall: ToolCallSummary) =>
        isToolName(toolCall.toolName) &&
        !isToolWithoutDescription(toolCall.toolName);
    const hasDescription =
        toolCalls.some(hasCallDescription) || Boolean(extraBody);
    const isGrouped = toolCalls.length > 1;
    const [expanded, setExpanded] = useState(false);

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

    // Collapsed rows show only what each call touched; detail lives behind the row.
    const renderInlinePreview = (): React.ReactNode => {
        if (visibleChips.length === 0) return null;
        const shown = visibleChips.slice(0, MAX_CHIPS_COLLAPSED);
        const overflow = visibleChips.length - shown.length;
        return (
            <Tooltip
                label={visibleChips
                    .map(({ label: chipLabel }) => chipLabel)
                    .join(', ')}
                multiline
                maw={360}
                openDelay={400}
            >
                <Text size="xs" truncate className={styles.target}>
                    {shown.map(({ label: chipLabel }) => chipLabel).join(', ')}
                    {overflow > 0 ? ` +${overflow}` : ''}
                </Text>
            </Tooltip>
        );
    };

    const head = (
        <Group gap={8} align="center" wrap="nowrap" className={styles.head}>
            <ToolCallRowIcon
                toolName={toolName}
                toolCalls={toolCalls}
                size={13}
                stroke={1.6}
                className={styles.icon}
                mcpServer={mcpServer}
                data-status={status}
            />
            {label ? (
                <Text size="xs" className={styles.label}>
                    {label}
                </Text>
            ) : (
                <Text size="xs" className={styles.label}>
                    Used {mcpDisplayMetadata?.label ?? 'MCP'}:{' '}
                    <ToolCallChip
                        maxWidth={260}
                        variant="transparent"
                        px={0}
                        className={styles.mcpToolChip}
                    >
                        {mcpToolDisplayName}
                    </ToolCallChip>
                </Text>
            )}
            {isGrouped && (
                <Box className={styles.countBadge}>{toolCalls.length}</Box>
            )}
            {!expanded && (
                <Box className={styles.previewSlot}>
                    {renderInlinePreview()}
                </Box>
            )}
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

    if (!isClickable) {
        return (
            <Box className={styles.row} data-status={status}>
                {head}
            </Box>
        );
    }

    return (
        <Box
            className={styles.row}
            data-expanded={expanded}
            data-status={status}
        >
            <UnstyledButton
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                w="100%"
                className={styles.rowButton}
            >
                {head}
            </UnstyledButton>
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
