import {
    assertUnreachable,
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
    type AgentOnboardingRunStatus,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconArrowRight,
    IconPlayerStop,
    IconRefresh,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import { AgentOnboardingActivityPanel } from './AgentOnboardingActivity';
import { AgentOnboardingFileBrowser } from './AgentOnboardingFileBrowser';
import { AgentOnboardingProgress } from './AgentOnboardingProgress';
import classes from './AgentOnboardingRunPage.module.css';
import {
    useAgentOnboardingRun,
    useCancelAgentOnboardingRun,
    useStartAgentOnboardingRun,
} from './hooks/useAgentOnboarding';
import {
    getAgentOnboardingDashboardUrl,
    getAgentOnboardingRunUrl,
} from './utils';

const STATUS_CONFIG: Record<
    AgentOnboardingRunStatus,
    { label: string; color: string }
> = {
    queued: { label: 'Queued', color: 'gray' },
    running: { label: 'Running', color: 'blue' },
    completed: { label: 'Complete', color: 'green' },
    failed: { label: 'Needs attention', color: 'red' },
    cancelled: { label: 'Cancelled', color: 'gray' },
};

const getStatusMessage = (run: AgentOnboardingRun): string => {
    switch (run.status) {
        case 'queued':
            return 'Your setup is queued and will begin shortly.';
        case 'running':
            return 'You can leave this page and return at any time.';
        case 'completed':
            return 'Your semantic layer and starter dashboard are ready.';
        case 'failed':
            return (
                run.errorMessage ??
                'The setup run could not be completed. You can try again.'
            );
        case 'cancelled':
            return 'This setup run was cancelled. You can start a new run.';
        default:
            return assertUnreachable(run.status, 'Unknown onboarding status');
    }
};

const RunActions: FC<{
    run: AgentOnboardingRun;
    onCancel: () => Promise<void>;
    onSkip: () => Promise<void>;
    onRetry: () => Promise<void>;
    onOpenProject: () => void;
    isCancelling: boolean;
    isRetrying: boolean;
}> = ({
    run,
    onCancel,
    onSkip,
    onRetry,
    onOpenProject,
    isCancelling,
    isRetrying,
}) => {
    if (!isAgentOnboardingRunTerminal(run.status)) {
        return (
            <Group gap="xs">
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlayerStop} />}
                    onClick={() => void onCancel()}
                    loading={isCancelling}
                >
                    {isCancelling ? 'Cancelling…' : 'Cancel setup'}
                </Button>
                <Button
                    variant="subtle"
                    color="gray"
                    onClick={() => void onSkip()}
                    disabled={isCancelling}
                >
                    Skip to project
                </Button>
            </Group>
        );
    }

    if (run.status === 'completed') {
        return (
            <Group gap="xs">
                <Button
                    component={Link}
                    to={getAgentOnboardingDashboardUrl(run.projectUuid)}
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                >
                    View dashboard
                </Button>
                <Button variant="default" onClick={onOpenProject}>
                    Open project
                </Button>
            </Group>
        );
    }

    return (
        <Group gap="xs">
            <Button
                leftSection={<MantineIcon icon={IconRefresh} />}
                onClick={() => void onRetry()}
                loading={isRetrying}
            >
                Try again
            </Button>
            <Button variant="default" onClick={onOpenProject}>
                Open project
            </Button>
        </Group>
    );
};

const AgentOnboardingRunPage: FC = () => {
    const { agentOnboardingRunUuid, projectUuid } = useParams<{
        agentOnboardingRunUuid: string;
        projectUuid: string;
    }>();
    const navigate = useNavigate();
    const [isCancellationRequested, setIsCancellationRequested] =
        useState(false);
    const runQuery = useAgentOnboardingRun(projectUuid, agentOnboardingRunUuid);
    const cancelMutation = useCancelAgentOnboardingRun();
    const startMutation = useStartAgentOnboardingRun();

    if (runQuery.isInitialLoading) {
        return <PageSpinner />;
    }

    if (runQuery.isError) {
        return <ErrorState error={runQuery.error.error} />;
    }

    if (!runQuery.data || !projectUuid || !agentOnboardingRunUuid) {
        return (
            <Page title="Project setup" withPaddedContent>
                <Alert color="red" icon={<IconAlertCircle />}>
                    This onboarding run could not be found.
                </Alert>
            </Page>
        );
    }

    const run = runQuery.data;
    const statusConfig = STATUS_CONFIG[run.status];
    const openProject = () => {
        void navigate(`/projects/${run.projectUuid}`);
    };
    const cancel = async () => {
        setIsCancellationRequested(true);
        try {
            await cancelMutation.mutateAsync({
                projectUuid: run.projectUuid,
                runUuid: run.agentOnboardingRunUuid,
            });
        } catch (error) {
            setIsCancellationRequested(false);
            throw error;
        }
    };
    const skip = async () => {
        try {
            await cancel();
            openProject();
        } catch {
            return;
        }
    };
    const retry = async () => {
        try {
            const nextRun = await startMutation.mutateAsync(run.projectUuid);
            void navigate(
                getAgentOnboardingRunUrl(
                    nextRun.agentOnboardingRunUuid,
                    nextRun.projectUuid,
                ),
                { replace: true },
            );
        } catch {
            return;
        }
    };

    return (
        <Page
            title="Building your Lightdash project"
            withPaddedContent
            fullPageScroll
        >
            <Box
                className={classes.page}
                mx="calc(-1 * var(--mantine-spacing-md))"
                my="calc(-1 * var(--mantine-spacing-md))"
                p="xl"
            >
                <Stack gap="lg" className={classes.content}>
                    <Group justify="space-between" align="flex-start">
                        <Stack gap={6}>
                            <Group gap="sm">
                                <Title order={2}>
                                    Building your Lightdash project
                                </Title>
                                <Badge
                                    color={statusConfig.color}
                                    variant="light"
                                >
                                    {statusConfig.label}
                                </Badge>
                            </Group>
                            {run.status !== 'failed' ? (
                                <Text c="dimmed">
                                    {isCancellationRequested &&
                                    !isAgentOnboardingRunTerminal(run.status)
                                        ? 'Stopping the setup run…'
                                        : getStatusMessage(run)}
                                </Text>
                            ) : null}
                        </Stack>
                        <RunActions
                            run={run}
                            onCancel={cancel}
                            onSkip={skip}
                            onRetry={retry}
                            onOpenProject={openProject}
                            isCancelling={
                                cancelMutation.isLoading ||
                                isCancellationRequested
                            }
                            isRetrying={startMutation.isLoading}
                        />
                    </Group>

                    {run.status === 'failed' ? (
                        <Alert
                            color="red"
                            icon={<MantineIcon icon={IconAlertCircle} />}
                            title="Setup stopped"
                        >
                            {getStatusMessage(run)}
                        </Alert>
                    ) : null}

                    <Paper
                        withBorder
                        radius="md"
                        className={classes.progressActivityCard}
                    >
                        <Box p="lg">
                            <AgentOnboardingProgress run={run} />
                        </Box>
                        <AgentOnboardingActivityPanel
                            key={run.agentOnboardingRunUuid}
                            events={run.events}
                            hasGeneratedFiles={run.files.length > 0}
                        />
                    </Paper>

                    <Paper withBorder radius="md" className={classes.workspace}>
                        <Box className={classes.workspacePanel}>
                            <Group h={48} px="md" justify="space-between">
                                <Text fw={600} fz="sm">
                                    Generated files
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    {run.files.length} files
                                </Text>
                            </Group>
                            <AgentOnboardingFileBrowser
                                projectUuid={run.projectUuid}
                                runUuid={run.agentOnboardingRunUuid}
                                files={run.files}
                            />
                        </Box>
                    </Paper>
                </Stack>
            </Box>
        </Page>
    );
};

export default AgentOnboardingRunPage;
