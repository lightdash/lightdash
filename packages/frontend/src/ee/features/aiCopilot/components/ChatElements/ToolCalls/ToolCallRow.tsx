import {
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
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
} from '@mantine-8/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { ToolCallDescription } from './descriptions/ToolCallDescription';
import { ToolCallChip } from './ToolCallChip';
import { ToolCallIcon } from './ToolCallIcon';
import styles from './ToolCallRow.module.css';
import { getToolCallChipLabel } from './utils/getToolCallChipLabel';
import {
    getMcpServerForToolName,
    getMcpToolDisplayMetadata,
    getMcpToolDisplayName,
} from './utils/mcpToolDisplay';
import { type ToolCallSummary } from './utils/types';

// Tools whose ToolCallDescription returns an empty fragment. Tracked here
// so the row doesn't render a chevron + clickable header that expand into
// blank space. Keep in sync with the empty `return <></>` cases in
// ToolCallDescription.tsx. `discoverFields` belongs to the empty-description
// list but is rescued by its extraBody (the subagent trace) via the
// hasDescription check below — adding it here is safe so long as extraBody
// is supplied wherever the trace is meaningful.
const TOOLS_WITHOUT_DESCRIPTION = new Set<ToolName>([
    'discoverFields',
    'generateUuids',
    'getProjectInfo',
    'improveContext',
    'listContent',
    'listKnowledgeDocuments',
    'listProjects',
    'loadSkill',
    'proposeChange',
    'proposeWriteback',
    'runSavedChart',
]);

// Tools whose description renders something tall (e.g. a code block) and can't
// be sensibly clipped to a single-line preview — collapse to verb + chevron.
const HIDE_INLINE_PREVIEW = new Set<ToolName>(['runSql']);

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
};

export const ToolCallRow: FC<Props> = ({
    toolName,
    toolCalls,
    status = 'done',
    mcpServers,
    extraBody,
    toolResults,
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
        ? status === 'running'
            ? TOOL_DISPLAY_MESSAGES[builtInToolName]
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[builtInToolName]
        : null;
    const hasDescription =
        (builtInToolName && !TOOLS_WITHOUT_DESCRIPTION.has(builtInToolName)) ||
        Boolean(extraBody);
    const isGrouped = toolCalls.length > 1;
    const [expanded, setExpanded] = useState(false);

    const chipLabels: (string | null)[] = toolCalls.map((tc) =>
        builtInToolName
            ? getToolCallChipLabel(builtInToolName, tc.toolArgs)
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
            hasDescription &&
            builtInToolName &&
            !HIDE_INLINE_PREVIEW.has(builtInToolName)
        ) {
            // Single call: show its description; clipped to one line by CSS.
            return (
                <Box className={styles.inlineDescription}>
                    <ToolCallDescription
                        toolName={builtInToolName}
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
                            style={{ animationDelay: `${idx * 28}ms` }}
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
            <ToolCallIcon
                toolName={toolName}
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
                    <ToolCallChip maxWidth={260} className={styles.mcpToolChip}>
                        {mcpToolDisplayName}
                    </ToolCallChip>
                </Text>
            )}
            {isGrouped && (
                <Box className={styles.countBadge}>{toolCalls.length}</Box>
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

    if (!isClickable) {
        return <Box className={styles.row}>{head}</Box>;
    }

    return (
        <Box className={styles.row} data-expanded={expanded}>
            <UnstyledButton
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                w="100%"
                className={styles.rowButton}
            >
                {head}
            </UnstyledButton>
            <Collapse
                in={expanded}
                transitionDuration={240}
                transitionTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
            >
                <Stack gap={8} className={styles.body}>
                    {builtInToolName
                        ? toolCalls.map((tc) => (
                              <ToolCallDescription
                                  key={tc.toolCallId}
                                  toolName={builtInToolName}
                                  toolCall={tc}
                                  toolResult={toolResults?.find(
                                      (result) =>
                                          result.toolCallId === tc.toolCallId,
                                  )}
                              />
                          ))
                        : null}
                    {extraBody}
                </Stack>
            </Collapse>
        </Box>
    );
};
