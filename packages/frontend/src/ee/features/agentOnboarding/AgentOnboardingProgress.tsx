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
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingRunPage.module.css';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    formatStageDuration,
    getAgentOnboardingProgressStageTimings,
    type AgentOnboardingProgressStage,
    type AgentOnboardingProgressStageTiming,
} from './utils';

const STAGE_ICONS: Record<AgentOnboardingProgressStage, Icon> = {
    explore: IconDatabaseSearch,
    semantic_layer: IconLayersLinked,
    dashboard: IconChartBar,
    ready: IconCheck,
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
    const { t } = useTranslation('agentOnboarding');
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
            aria-label={t('progress.stagesLabel')}
        >
            {AGENT_ONBOARDING_PROGRESS_STAGES.map(({ stage }, index) => {
                const stageIcon = STAGE_ICONS[stage];
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
                                            : stageIcon
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
                                    ? t(`progress.stages.${stage}.activeLabel`)
                                    : t(`progress.stages.${stage}.label`)}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {t(`progress.stages.${stage}.description`)}
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
