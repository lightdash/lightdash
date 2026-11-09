import { Box, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ReasoningHistoryRow } from '../../../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import {
    hasVersionNarration,
    versionNarrationCountLabel,
    type AppVersionNarrationData,
} from '../utils/versionNarration';
import classes from './BuildCards.module.css';
import BuildSteps from './BuildSteps';

type Props = {
    narration: AppVersionNarrationData;
    isLive: boolean;
    /** Folds reasoning + activity into one row labelled e.g. "Worked for
     *  57s", with the turn's time; null shows them as separate rows. */
    summary: { label: string; at: Date } | null;
    className?: string;
};

const BuildLogRow: FC<{
    label: string;
    at: Date;
    narration: AppVersionNarrationData;
}> = ({ label, at, narration }) => {
    const [open, setOpen] = useState(false);
    const timeAgo = useTimeAgo(at);
    const counts = versionNarrationCountLabel(narration);
    return (
        <Box className={classes.activityRow}>
            <UnstyledButton
                w="100%"
                className={classes.activityHeader}
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                title={`${label} · ${timeAgo}`}
            >
                <Group gap="xs" wrap="nowrap">
                    <Text size="xs" fw={500} className={classes.activityLabel}>
                        {label}
                    </Text>
                    <Text
                        size="xs"
                        truncate
                        miw={0}
                        className={classes.buildLogCount}
                    >
                        {counts}
                    </Text>
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={classes.activityChevron}
                        data-open={open || undefined}
                    />
                </Group>
            </UnstyledButton>
            <Collapse expanded={open} transitionDuration={200}>
                <Box className={classes.buildLogBody}>
                    <BuildSteps
                        steps={narration.activity}
                        reasoning={narration.reasoning}
                        isLive={false}
                    />
                </Box>
            </Collapse>
        </Box>
    );
};

const ActivityLogRow: FC<{ steps: string[] }> = ({ steps }) => {
    const [open, setOpen] = useState(false);
    return (
        <Box className={classes.activityRow}>
            <UnstyledButton
                w="100%"
                className={classes.activityHeader}
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                <Group gap="xs" wrap="nowrap">
                    <Text size="xs" fw={500} className={classes.activityLabel}>
                        Activity
                    </Text>
                    <Text size="xs" c="dimmed" truncate miw={0}>
                        {steps.length}{' '}
                        {steps.length === 1 ? 'action' : 'actions'}
                    </Text>
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={classes.activityChevron}
                        data-open={open || undefined}
                    />
                </Group>
            </UnstyledButton>
            <Collapse expanded={open} transitionDuration={200}>
                <Box className={classes.activityBody}>
                    <BuildSteps steps={steps} reasoning={[]} isLive={false} />
                </Box>
            </Collapse>
        </Box>
    );
};

/** The shared Reasoning/Activity presentation. */
const AppVersionNarration: FC<Props> = ({
    narration,
    isLive,
    summary,
    className,
}) => {
    if (!hasVersionNarration(narration)) return null;
    if (summary !== null) {
        return (
            <Box className={className}>
                <BuildLogRow
                    label={summary.label}
                    at={summary.at}
                    narration={narration}
                />
            </Box>
        );
    }

    return (
        <Box className={className}>
            {narration.reasoning.length > 0 && (
                <ReasoningHistoryRow
                    texts={narration.reasoning}
                    isLive={isLive}
                />
            )}
            {narration.activity.length > 0 && (
                <ActivityLogRow steps={narration.activity} />
            )}
        </Box>
    );
};

export default AppVersionNarration;
