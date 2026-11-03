import {
    Anchor,
    Button,
    Group,
    Loader,
    Popover,
    Stack,
    Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import MantineIcon from '../../../components/common/MantineIcon';
import AppColorSchemeScope from '../../../components/NavBar/AppColorSchemeScope';
import { AgentOnboardingProgress } from './AgentOnboardingProgress';
import { RunRecentSteps } from './AgentOnboardingRunChanges';
import { useAuroraRun } from './hooks/useAuroraRun';
import {
    AGENT_ONBOARDING_STAGE_ACTIVE_LABELS,
    getAgentOnboardingProgressStageTimings,
    getAgentOnboardingRunUrl,
} from './utils';

/** A quiet navbar handle on the setup run, so progress is one click away from anywhere */
export const AgentOnboardingNavIndicator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { run, isLive } = useAuroraRun(projectUuid);
    const [opened, { toggle, close }] = useDisclosure(false);
    if (!run || !isLive) return null;

    const timings = getAgentOnboardingProgressStageTimings(run);
    const activeIndex = Math.max(
        timings.findIndex(({ state }) => state === 'active'),
        0,
    );
    const stageLabel =
        AGENT_ONBOARDING_STAGE_ACTIVE_LABELS[timings[activeIndex].stage];

    return (
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
                    variant="default"
                    onClick={toggle}
                    leftSection={<Loader size={10} color="gray" />}
                    aria-label={`Project setup: ${stageLabel}`}
                >
                    Setting up {activeIndex + 1}/{timings.length}
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
                        <AgentOnboardingProgress run={run} />
                        <RunRecentSteps run={run} />
                        <Group justify="flex-end">
                            <Anchor
                                component={Link}
                                to={getAgentOnboardingRunUrl(
                                    run.agentOnboardingRunUuid,
                                    projectUuid,
                                )}
                                onClick={close}
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
    );
};
