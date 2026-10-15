import { assertUnreachable, type AiWritebackStep } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import {
    IconFileText,
    IconPencil,
    IconSearch,
    IconTerminal2,
    type TablerIconsProps,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type FC, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { ToolCallChip } from './ToolCallChip';
import styles from './ToolCallRow.module.css';

type StepKind = AiWritebackStep['kind'];

// Generic presentation for an agent's file actions — no knowledge of writeback.
// `kind` drives the icon + the grouped verb; consecutive same-kind steps are
// collapsed into one row (e.g. "Edited 3 files" with a chip per file), matching
// how the agent's own tool steps group and chip.
const KIND_DISPLAY: Record<
    StepKind,
    {
        icon: (props: TablerIconsProps) => JSX.Element;
        chips: boolean;
    }
> = {
    read: { icon: IconFileText, chips: true },
    edit: { icon: IconPencil, chips: true },
    search: { icon: IconSearch, chips: true },
    compile: { icon: IconTerminal2, chips: false },
    stage: { icon: IconTerminal2, chips: false },
};

const stepGroupLabel = (group: StepGroup, t: TFunction): string => {
    const count = group.labels.length;
    switch (group.kind) {
        case 'read':
            return t('agentSteps.read', { count });
        case 'edit':
            return t('agentSteps.edited', { count });
        case 'search':
            return t('agentSteps.searched', { count });
        case 'compile':
            return t('agentSteps.compilingProject');
        case 'stage':
            // Stages carry their full label as the line ("Cloning project").
            return group.labels[0];
        default:
            return assertUnreachable(group.kind, 'Unknown agent step kind');
    }
};

type StepGroup = { kind: StepKind; labels: string[] };

const groupSteps = (steps: AiWritebackStep[]): StepGroup[] =>
    steps.reduce<StepGroup[]>((groups, step) => {
        const last = groups[groups.length - 1];
        // Stages never group (each is a distinct one-off line); file actions
        // group with the immediately preceding same-kind run.
        if (last && last.kind === step.kind && step.kind !== 'stage') {
            last.labels.push(step.label);
            return groups;
        }
        groups.push({ kind: step.kind, labels: [step.label] });
        return groups;
    }, []);

const MAX_CHIPS = 4;

const StepGroupRow: FC<{ group: StepGroup }> = ({ group }) => {
    const { t } = useTranslation('aiCopilotChat');
    const display = KIND_DISPLAY[group.kind];
    const count = group.labels.length;
    const label = stepGroupLabel(group, t);

    const shownChips = group.labels.slice(0, MAX_CHIPS);
    const overflow = count - shownChips.length;

    return (
        <Group gap={8} align="center" wrap="nowrap" className={styles.head}>
            <MantineIcon
                icon={display.icon}
                size={13}
                stroke={1.6}
                className={styles.icon}
            />
            <Text size="xs" className={styles.label}>
                {label}
            </Text>
            {display.chips && (
                <Group gap={4} wrap="nowrap" className={styles.chips}>
                    {shownChips.map((chipLabel, idx) => (
                        <ToolCallChip
                            // eslint-disable-next-line react/no-array-index-key
                            key={`${chipLabel}-${idx}`}
                            className={styles.chipAppear}
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
            )}
        </Group>
    );
};

/**
 * Renders a list of generic agent steps (reads, edits, searches, compiles,
 * stages) as grouped rows that match the chat's tool-step styling. Purely
 * presentational and tool-agnostic — callers adapt their domain progress into
 * {@link AiWritebackStep}s before passing them here.
 */
export const AgentStepGroups: FC<{ steps: AiWritebackStep[] }> = ({
    steps,
}) => {
    if (steps.length === 0) return null;
    const groups = groupSteps(steps);
    return (
        <Stack gap={4}>
            {groups.map((group, idx) => (
                <Box
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${group.kind}-${idx}`}
                >
                    <StepGroupRow group={group} />
                </Box>
            ))}
        </Stack>
    );
};
