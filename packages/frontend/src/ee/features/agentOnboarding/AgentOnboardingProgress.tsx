import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import {
    IconChartBar,
    IconCheck,
    IconDatabaseSearch,
    IconLayersLinked,
    type Icon,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingRunPage.module.css';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    formatStageDuration,
    getAgentOnboardingProgressStageTimings,
    type AgentOnboardingProgressStage,
    type AgentOnboardingProgressStageTiming,
} from './utils';

const STAGE_CONFIG: Record<
    AgentOnboardingProgressStage,
    { label: string; activeLabel: string; description: string; icon: Icon }
> = {
    explore: {
        label: 'Explore your warehouse',
        activeLabel: 'Exploring your warehouse',
        description: 'Reads your tables to find a useful starting point.',
        icon: IconDatabaseSearch,
    },
    semantic_layer: {
        label: 'Build the semantic layer',
        activeLabel: 'Building the semantic layer',
        description: 'Turns your data into reusable metrics and dimensions.',
        icon: IconLayersLinked,
    },
    dashboard: {
        label: 'Create a starter dashboard',
        activeLabel: 'Creating a starter dashboard',
        description: 'Puts the first charts and filters together for you.',
        icon: IconChartBar,
    },
    ready: {
        label: 'Verify and hand off',
        activeLabel: 'Verifying and handing off',
        description: 'Checks everything works and opens the project.',
        icon: IconCheck,
    },
};

type StageState = AgentOnboardingProgressStageTiming['state'] | 'stopped';

// A cancelled or failed run leaves its last started stage unfinished
const getStageStates = (
    run: AgentOnboardingRun | undefined,
    timings: AgentOnboardingProgressStageTiming[] | undefined,
): StageState[] => {
    if (!run || !timings) {
        return AGENT_ONBOARDING_PROGRESS_STAGES.map(() => 'not_started');
    }
    if (run.status === 'completed') {
        return AGENT_ONBOARDING_PROGRESS_STAGES.map(() => 'completed');
    }
    const states: StageState[] = timings.map(({ state }) => state);
    if (run.status === 'cancelled' || run.status === 'failed') {
        const lastStartedIndex = states.findLastIndex(
            (state) => state !== 'not_started',
        );
        if (lastStartedIndex >= 0) states[lastStartedIndex] = 'stopped';
    }
    return states;
};

export const AgentOnboardingProgress: FC<{ run?: AgentOnboardingRun }> = ({
    run,
}) => {
    const [now, setNow] = useState(Date.now());
    const isTerminal = !run || isAgentOnboardingRunTerminal(run.status);

    useEffect(() => {
        if (isTerminal) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [isTerminal]);

    const timings = useMemo(
        () =>
            run ? getAgentOnboardingProgressStageTimings(run, now) : undefined,
        [now, run],
    );
    const states = getStageStates(run, timings);

    return (
        <Box
            component="ol"
            className={classes.stages}
            aria-label="Setup stages"
        >
            {AGENT_ONBOARDING_PROGRESS_STAGES.map(({ stage }, index) => {
                const config = STAGE_CONFIG[stage];
                const state = states[index];
                const timing = timings?.[index];
                return (
                    <Box
                        component="li"
                        key={stage}
                        className={classes.stage}
                        data-state={state}
                        aria-current={state === 'active' ? 'step' : undefined}
                    >
                        <Box className={classes.stageRail}>
                            <Box className={classes.stageGlyph}>
                                <MantineIcon
                                    icon={
                                        state === 'completed'
                                            ? IconCheck
                                            : config.icon
                                    }
                                    size={14}
                                />
                            </Box>
                            <Box className={classes.stageLine} />
                        </Box>
                        <Box className={classes.stageBody}>
                            <Text
                                fz="sm"
                                fw={500}
                                className={classes.stageLabel}
                            >
                                {state === 'active'
                                    ? config.activeLabel
                                    : config.label}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {config.description}
                            </Text>
                        </Box>
                        {timing && timing.durationMs !== null ? (
                            <Text
                                fz="xs"
                                c="dimmed"
                                ff="monospace"
                                className={classes.stageDuration}
                            >
                                {formatStageDuration(timing.durationMs)}
                            </Text>
                        ) : (
                            <span />
                        )}
                    </Box>
                );
            })}
        </Box>
    );
};
