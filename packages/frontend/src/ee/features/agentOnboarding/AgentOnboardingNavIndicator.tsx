import {
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Popover,
    Stack,
    Text,
    type BoxProps,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import MantineIcon from '../../../components/common/MantineIcon';
import AppColorSchemeScope from '../../../components/NavBar/AppColorSchemeScope';
import classes from './AgentOnboardingNavIndicator.module.css';
import { RunRecentSteps } from './AgentOnboardingRunChanges';
import { useAuroraRun } from './hooks/useAuroraRun';
import {
    AGENT_ONBOARDING_STAGE_ACTIVE_LABELS,
    AGENT_ONBOARDING_STAGE_LABELS,
    formatStageDuration,
    getAgentOnboardingProgressStageTimings,
    getAgentOnboardingRunUrl,
    getStageStates,
} from './utils';

/** A quiet navbar handle on the setup run, so progress is one click away from anywhere */
export const AgentOnboardingNavIndicator: FC<
    { projectUuid: string } & Pick<BoxProps, 'className' | 'visibleFrom'>
> = ({ projectUuid, className, visibleFrom }) => {
    const { run, isLive } = useAuroraRun(projectUuid);
    const [opened, { toggle, close }] = useDisclosure(false);
    if (!run || !isLive) return null;

    const timings = getAgentOnboardingProgressStageTimings(run);
    const states = getStageStates(run, timings);
    const activeIndex = Math.max(
        timings.findIndex(({ state }) => state === 'active'),
        0,
    );
    const stageLabel =
        AGENT_ONBOARDING_STAGE_ACTIVE_LABELS[timings[activeIndex].stage];

    return (
        <Box className={className} visibleFrom={visibleFrom}>
            <Popover
                opened={opened}
                onChange={(next) => (next ? undefined : close())}
                onDismiss={close}
                width={340}
                position="bottom-end"
                shadow="lg"
            >
                <Popover.Target>
                    <Button
                        size="xs"
                        variant="light"
                        color="blue"
                        className={classes.button}
                        onClick={toggle}
                        leftSection={<Loader size={10} color="blue" />}
                        aria-label={`Project setup: ${stageLabel}`}
                    >
                        <span className={classes.buttonWord}>Setting up </span>
                        {activeIndex + 1}/{timings.length}
                    </Button>
                </Popover.Target>
                <Popover.Dropdown p={0}>
                    <AppColorSchemeScope>
                        <Stack gap="md" p="md">
                            <Stack gap={2}>
                                <Text fz="sm" fw={600}>
                                    {AI_NAME} is setting up your project
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {stageLabel}. You can keep working.
                                </Text>
                            </Stack>
                            <Box component="ol" className={classes.stages}>
                                {timings.map(({ stage, durationMs }, index) => (
                                    <Box
                                        component="li"
                                        key={stage}
                                        className={classes.stage}
                                        data-state={states[index]}
                                    >
                                        <Box className={classes.marker}>
                                            {states[index] === 'completed' && (
                                                <MantineIcon
                                                    icon={IconCheck}
                                                    size={10}
                                                    stroke={2.5}
                                                />
                                            )}
                                        </Box>
                                        <Text fz="sm" className={classes.label}>
                                            {
                                                AGENT_ONBOARDING_STAGE_LABELS[
                                                    stage
                                                ]
                                            }
                                        </Text>
                                        {states[index] !== 'not_started' &&
                                            durationMs !== null && (
                                                <Text
                                                    fz="xs"
                                                    c="dimmed"
                                                    className={classes.duration}
                                                >
                                                    {formatStageDuration(
                                                        durationMs,
                                                    )}
                                                </Text>
                                            )}
                                    </Box>
                                ))}
                            </Box>
                            <Box className={classes.recent}>
                                <RunRecentSteps run={run} />
                            </Box>
                            <Group justify="flex-end">
                                <Anchor
                                    component={Link}
                                    to={getAgentOnboardingRunUrl(
                                        run.agentOnboardingRunUuid,
                                        projectUuid,
                                    )}
                                    onClick={close}
                                    viewTransition
                                    fz="xs"
                                    fw={500}
                                    c="dark"
                                >
                                    <Group gap={4} wrap="nowrap">
                                        Open full view
                                        <MantineIcon
                                            icon={IconArrowRight}
                                            size={12}
                                        />
                                    </Group>
                                </Anchor>
                            </Group>
                        </Stack>
                    </AppColorSchemeScope>
                </Popover.Dropdown>
            </Popover>
        </Box>
    );
};
