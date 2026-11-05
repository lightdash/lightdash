import { isAgentOnboardingRunTerminal } from '@lightdash/common';
import { Box, Group, Loader, Text } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import { AI_NAME } from '../../../components/common/aiName';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAuroraRun } from './hooks/useAuroraRun';
import { useNow } from './hooks/useNow';
import classes from './OnboardingRunActivity.module.css';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    AGENT_ONBOARDING_STAGE_ACTIVE_LABELS,
    formatStageDuration,
    plural,
    getAgentOnboardingProgressStageTimings,
    summarizeAgentOnboardingEvents,
} from './utils';

type Variant = 'toast' | 'grouped';

/** The drafting run, shown inside the setup steps so nobody leaves them to watch it */
export const OnboardingRunActivity: FC<{
    projectUuid: string;
    variant?: Variant;
}> = ({ projectUuid, variant = 'toast' }) => {
    const { run, isLive } = useAuroraRun(projectUuid);
    const now = useNow(isLive);
    if (!run || run.status === 'cancelled') return null;
    // Home's setup guide owns the retry, so a failure stays out of the setup steps
    if (variant === 'toast' && run.status === 'failed') return null;

    const isDone = run.status === 'completed';
    const isFailed = run.status === 'failed';
    const timings = getAgentOnboardingProgressStageTimings(run, now);
    const activeIndex = Math.max(
        timings.findIndex(({ state }) => state === 'active'),
        0,
    );
    const activeStage = AGENT_ONBOARDING_PROGRESS_STAGES[activeIndex].stage;
    const summary = summarizeAgentOnboardingEvents(run.events);
    const startedAt = Date.parse(run.startedAt ?? run.createdAt);
    const endedAt = run.completedAt ? Date.parse(run.completedAt) : now;

    const isToast = variant === 'toast';
    const title = isDone
        ? isToast
            ? 'Your data is ready to explore'
            : 'Your semantic layer and starter questions are ready'
        : isToast
          ? 'Getting your data ready'
          : isFailed
            ? "Project setup couldn't finish"
            : `${AI_NAME} is building your semantic layer`;
    const counts = [
        summary.tables > 0 && plural(summary.tables, 'table'),
        summary.models > 0 && plural(summary.models, 'model'),
        !!run.handoff?.starterQuestions.length &&
            plural(run.handoff.starterQuestions.length, 'starter question'),
    ].filter((count): count is string => !!count);
    const stageLine = isFailed
        ? 'You can try again from home.'
        : isDone
          ? counts.join(' · ')
          : isToast
            ? 'Keep going, this takes a few minutes'
            : `${AGENT_ONBOARDING_STAGE_ACTIVE_LABELS[activeStage]}, ${activeIndex + 1} of ${timings.length}`;

    return (
        <Box
            className={classes.root}
            data-variant={variant}
            data-state={run.status}
            data-run-activity
        >
            <Group gap="sm" wrap="nowrap" align="flex-start">
                <Box className={classes.glyph} aria-hidden>
                    {isDone ? (
                        <MantineIcon icon={IconCheck} size={16} color="green" />
                    ) : isFailed ? (
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={16}
                            color="orange"
                        />
                    ) : (
                        <Loader size={14} />
                    )}
                </Box>
                <Box
                    className={classes.heading}
                    role="status"
                    aria-live="polite"
                >
                    <Text fz="sm" fw={500}>
                        {title}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate={isToast}>
                        {stageLine}
                    </Text>
                </Box>
                {!isToast && (
                    <Text fz="xs" c="dimmed" className={classes.elapsed}>
                        {formatStageDuration(endedAt - startedAt)}
                    </Text>
                )}
            </Group>

            {!isToast && !isAgentOnboardingRunTerminal(run.status) && (
                <Box component="ol" className={classes.bar} aria-hidden>
                    {timings.map(({ stage, state }) => (
                        <Box
                            component="li"
                            key={stage}
                            className={classes.segment}
                            data-state={state}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
};
