import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import { Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { RunRecentSteps } from './AgentOnboardingRunChanges';
import classes from './AgentOnboardingRunPage.module.css';
import { useNow } from './hooks/useNow';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    AGENT_ONBOARDING_STAGE_LABELS,
    formatStageDuration,
    getAgentOnboardingProgressStageTimings,
    getStageStates,
} from './utils';

export const RunJourney: FC<{ run: AgentOnboardingRun }> = ({ run }) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const now = useNow(isLive);
    const timings = getAgentOnboardingProgressStageTimings(run, now);
    const states = getStageStates(run, timings);

    return (
        <Box>
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
                                <Text fz="xs" fw={500} truncate>
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
        </Box>
    );
};
