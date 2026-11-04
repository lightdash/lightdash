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
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingRunPage.module.css';
import { useNow } from './hooks/useNow';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    AGENT_ONBOARDING_STAGE_ACTIVE_LABELS,
    formatStageDuration,
    getStageStates,
    getAgentOnboardingProgressStageTimings,
    type AgentOnboardingProgressStage,
} from './utils';

const STAGE_CONFIG: Record<
    AgentOnboardingProgressStage,
    { label: string; description: string; icon: Icon }
> = {
    explore: {
        label: 'Explore your warehouse',
        description: 'Reads your tables to find a useful starting point.',
        icon: IconDatabaseSearch,
    },
    semantic_layer: {
        label: 'Build the semantic layer',
        description: 'Turns your data into reusable metrics and dimensions.',
        icon: IconLayersLinked,
    },
    dashboard: {
        label: 'Create a starter dashboard',
        description: 'Puts the first charts and filters together for you.',
        icon: IconChartBar,
    },
    ready: {
        label: 'Verify and hand off',
        description: 'Checks everything works and opens the project.',
        icon: IconCheck,
    },
};

export const AgentOnboardingProgress: FC<{ run?: AgentOnboardingRun }> = ({
    run,
}) => {
    const now = useNow(!!run && !isAgentOnboardingRunTerminal(run.status));

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
                                    ? AGENT_ONBOARDING_STAGE_ACTIVE_LABELS[
                                          stage
                                      ]
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
