import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import { Stepper, Text, Tooltip, type StepperStepProps } from '@mantine-8/core';
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
    getAgentOnboardingProgressStageIndex,
    getAgentOnboardingProgressStageTimings,
    type AgentOnboardingProgressStage,
} from './utils';

const STAGE_CONFIG: Record<
    AgentOnboardingProgressStage,
    { label: string; description: string; icon: Icon }
> = {
    explore: {
        label: 'Explore',
        description:
            'Looks through your warehouse to understand your data and choose a useful starting point.',
        icon: IconDatabaseSearch,
    },
    semantic_layer: {
        label: 'Semantic layer',
        description:
            'Organizes your data into clear, reusable definitions for reporting.',
        icon: IconLayersLinked,
    },
    dashboard: {
        label: 'Dashboard',
        description:
            'Creates a starter dashboard with useful metrics, charts, filters, and details.',
        icon: IconChartBar,
    },
    ready: {
        label: 'Ready',
        description:
            'Checks that everything works and gets your new project ready to use.',
        icon: IconCheck,
    },
};

const ProgressStep: FC<StepperStepProps & { tooltip: string }> = ({
    tooltip,
    ...stepProps
}) => (
    <Tooltip label={tooltip} maw={360} multiline withArrow withinPortal>
        <Stepper.Step {...stepProps} />
    </Tooltip>
);

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
    const activeStageIndex = timings?.findIndex(
        ({ state }) => state === 'active',
    );
    const currentStageIndex = getAgentOnboardingProgressStageIndex(
        run?.stage ?? null,
    );
    const active = !run
        ? -1
        : run.status === 'completed'
          ? (timings?.length ?? 0)
          : activeStageIndex !== undefined && activeStageIndex >= 0
            ? activeStageIndex
            : Math.max(currentStageIndex ?? 0, 0);

    return (
        <Stepper
            active={active}
            size="xs"
            iconSize={38}
            classNames={{
                root: classes.progressStepper,
                steps: classes.progressSteps,
                step: classes.progressStep,
                stepBody: classes.progressStepBody,
            }}
        >
            {AGENT_ONBOARDING_PROGRESS_STAGES.map(({ stage }) => {
                const timing = timings?.find(
                    ({ stage: timingStage }) => timingStage === stage,
                );
                const config = STAGE_CONFIG[stage];
                const icon = <MantineIcon icon={config.icon} size="md" />;
                return (
                    <ProgressStep
                        key={stage}
                        tooltip={config.description}
                        label={config.label}
                        description={
                            timing ? (
                                <Text fz="xs" c="dimmed" ff="monospace">
                                    {formatStageDuration(timing.durationMs)}
                                </Text>
                            ) : undefined
                        }
                        icon={icon}
                        completedIcon={icon}
                        loading={timing?.state === 'active'}
                        allowStepSelect={false}
                    />
                );
            })}
        </Stepper>
    );
};
