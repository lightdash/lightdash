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
import { IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { ToolCallDescription } from './descriptions/ToolCallDescription';
import { ToolCallChip } from './ToolCallChip';
import styles from './ToolCallRow.module.css';
import { getToolCallChipLabel } from './utils/getToolCallChipLabel';
import { getToolIcon } from './utils/toolIcons';
import { type ToolCallSummary } from './utils/types';

const TOOLS_WITHOUT_DESCRIPTION = new Set<ToolName>([
    'improveContext',
    'proposeChange',
    'runSavedChart',
    'listWarehouseTables',
    'describeWarehouseTable',
]);

// Tools whose description renders something tall (e.g. a code block) and can't
// be sensibly clipped to a single-line preview — collapse to verb + chevron.
const HIDE_INLINE_PREVIEW = new Set<ToolName>(['runSql']);

// Max chips shown inline when collapsed before "+N more".
const MAX_CHIPS_COLLAPSED = 3;

export type ToolCallRowStatus = 'running' | 'done' | 'error';

type Props = {
    toolName: ToolName;
    toolCalls: ToolCallSummary[];
    status?: ToolCallRowStatus;
    /**
     * Optional extra content rendered inside the expanded body, below the
     * per-call descriptions. Used to surface things like the discoverFields
     * subagent trace.
     */
    extraBody?: React.ReactNode;
};

export const ToolCallRow: FC<Props> = ({
    toolName,
    toolCalls,
    status = 'done',
    extraBody,
}) => {
    const Icon = getToolIcon(toolName);
    const label =
        status === 'running'
            ? TOOL_DISPLAY_MESSAGES[toolName]
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[toolName];
    const hasDescription =
        !TOOLS_WITHOUT_DESCRIPTION.has(toolName) || Boolean(extraBody);
    const isGrouped = toolCalls.length > 1;
    const [expanded, setExpanded] = useState(false);

    const chipLabels: (string | null)[] = toolCalls.map((tc) =>
        getToolCallChipLabel(toolName, tc.toolArgs),
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
            !HIDE_INLINE_PREVIEW.has(toolName)
        ) {
            // Single call: show its description; clipped to one line by CSS.
            return (
                <Box className={styles.inlineDescription}>
                    <ToolCallDescription
                        toolName={toolName}
                        toolCall={toolCalls[0]}
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
            <MantineIcon
                icon={Icon}
                size={13}
                stroke={1.6}
                className={styles.icon}
                data-status={status}
            />
            <Text size="xs" className={styles.label}>
                {label}
            </Text>
            {isGrouped && (
                <Box className={styles.countBadge}>{toolCalls.length}</Box>
            )}
            <Box className={styles.previewSlot}>{renderInlinePreview()}</Box>
            {isClickable && (
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
                    {toolCalls.map((tc) => (
                        <ToolCallDescription
                            key={tc.toolCallId}
                            toolName={toolName}
                            toolCall={tc}
                        />
                    ))}
                    {extraBody}
                </Stack>
            </Collapse>
        </Box>
    );
};
