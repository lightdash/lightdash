import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import { Box, Group, Paper, Text } from '@mantine/core';
import { type FC } from 'react';
import { RunRecentSteps } from './AgentOnboardingRunChanges';
import classes from './AgentOnboardingRunPage.module.css';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    AGENT_ONBOARDING_STAGE_LABELS,
    formatStageDuration,
    getAgentOnboardingProgressStageTimings,
    getStageStates,
} from './utils';

export const RunJourney: FC<{ run: AgentOnboardingRun; now: number }> = ({
    run,
    now,
}) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const timings = getAgentOnboardingProgressStageTimings(run, now);
    const states = getStageStates(run, timings);

    return (
        <Paper className={classes.journey}>
            <Box component="ol" className={classes.track}>
                {AGENT_ONBOARDING_PROGRESS_STAGES.map(({ stage }, index) => {
                    const state = states[index];
                    const durationMs =
                        state === 'not_started'
                            ? null
                            : (timings[index]?.durationMs ?? null);
                    return (
                        <Box
                            component="li"
                            key={stage}
                            className={classes.trackStep}
                            data-state={state}
                            aria-current={
                                state === 'active' ? 'step' : undefined
                            }
                        >
                            <Box className={classes.trackBar} />
                            <Group
                                gap={6}
                                wrap="nowrap"
                                justify="space-between"
                            >
                                <Text fz="sm" fw={500} truncate>
                                    {AGENT_ONBOARDING_STAGE_LABELS[stage]}
                                </Text>
                                {durationMs !== null && (
                                    <Text
                                        fz="xs"
                                        c="dimmed"
                                        className={classes.trackDuration}
                                    >
                                        {formatStageDuration(durationMs)}
                                    </Text>
                                )}
                            </Group>
                        </Box>
                    );
                })}
            </Box>
            {isLive && (
                <Box className={classes.journeySteps}>
                    <RunRecentSteps run={run} />
                </Box>
            )}
        </Paper>
    );
};
