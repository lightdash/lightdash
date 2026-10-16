import {
    assertUnreachable,
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
    type AgentOnboardingRunStatus,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowRight,
    IconPlayerStop,
    IconRefresh,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import PageSpinner from '../../../components/PageSpinner';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { AgentOnboardingActivityPanel } from './AgentOnboardingActivity';
import { AgentOnboardingDemoOffer } from './AgentOnboardingDemoOffer';
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
import { setWatchedAgentOnboardingRun } from './watchedRunStore';

const RunStatus: FC<{ status: AgentOnboardingRunStatus }> = ({ status }) => {
    const { t } = useTranslation('agentOnboarding');
    return (
        <Group gap={6} wrap="nowrap" pt={4}>
            <span className={classes.statusDot} data-status={status} />
            <Text fz="sm" fw={500} c="dimmed">
                {t(`run.status.${status}`)}
            </Text>
        </Group>
    );
};

const getStatusMessage = (t: TFunction, run: AgentOnboardingRun): string => {
    switch (run.status) {
        case 'queued':
            return t('run.statusMessage.queued');
        case 'running':
            return t('run.statusMessage.running');
        case 'completed':
            return t('run.statusMessage.completed');
        case 'failed':
            return run.errorMessage ?? t('run.statusMessage.failed');
        case 'cancelled':
            return t('run.statusMessage.cancelled');
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
    const { t } = useTranslation('agentOnboarding');
    if (!isAgentOnboardingRunTerminal(run.status)) {
        return (
            <Group gap="xs">
                <Button
                    variant="light"
                    color="red"
                    leftSection={<MantineIcon icon={IconPlayerStop} />}
                    onClick={() => void onCancel()}
                    loading={isCancelling}
                >
                    {isCancelling ? t('run.cancelling') : t('run.cancelSetup')}
                </Button>
                <Button
                    variant="subtle"
                    color="gray"
                    onClick={() => void onSkip()}
                    disabled={isCancelling}
                >
                    {t('run.skipToProject')}
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
                    {t('run.viewDashboard')}
                </Button>
                <Button variant="default" onClick={onOpenProject}>
                    {t('run.openProject')}
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
                {t('run.tryAgain')}
            </Button>
            <Button variant="default" onClick={onOpenProject}>
                {t('run.openProject')}
            </Button>
        </Group>
    );
};

const AgentOnboardingRunPage: FC = () => {
    const { t } = useTranslation('agentOnboarding');
    const { agentOnboardingRunUuid } = useParams();
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const [isCancellationRequested, setIsCancellationRequested] =
        useState(false);
    const runQuery = useAgentOnboardingRun(projectUuid, agentOnboardingRunUuid);
    const cancelMutation = useCancelAgentOnboardingRun();
    const startMutation = useStartAgentOnboardingRun();

    const runStatus = runQuery.data?.status;
    const runUuid = runQuery.data?.agentOnboardingRunUuid;
    const runProjectUuid = runQuery.data?.projectUuid;

    useEffect(() => {
        if (
            !runUuid ||
            !runProjectUuid ||
            !runStatus ||
            isAgentOnboardingRunTerminal(runStatus)
        ) {
            return;
        }
        setWatchedAgentOnboardingRun({
            agentOnboardingRunUuid: runUuid,
            projectUuid: runProjectUuid,
        });
    }, [runUuid, runProjectUuid, runStatus]);

    if (runQuery.isInitialLoading) {
        return <PageSpinner />;
    }

    if (runQuery.isError) {
        return <ErrorState error={runQuery.error.error} />;
    }

    if (!runQuery.data || !projectUuid || !agentOnboardingRunUuid) {
        return (
            <Page title={t('pageTitle')} withPaddedContent>
                <Alert color="red" icon={<IconAlertCircle />}>
                    {t('run.notFound')}
                </Alert>
            </Page>
        );
    }

    const run = runQuery.data;
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
        <Page title={t('run.title')} withPaddedContent fullPageScroll>
            <Box
                className={classes.page}
                mx="calc(-1 * var(--mantine-spacing-md))"
                my="calc(-1 * var(--mantine-spacing-md))"
                p="lg"
            >
                <Stack gap="md" className={classes.content}>
                    <Group justify="space-between" align="flex-start">
                        <Stack gap={4}>
                            <Group gap="sm" align="flex-start">
                                <Title order={2}>{t('run.title')}</Title>
                                <RunStatus status={run.status} />
                            </Group>
                            {run.status !== 'failed' ? (
                                <Text c="dimmed" fz="sm">
                                    {isCancellationRequested &&
                                    !isAgentOnboardingRunTerminal(run.status)
                                        ? t('run.stopping')
                                        : getStatusMessage(t, run)}
                                    {!isAgentOnboardingRunTerminal(
                                        run.status,
                                    ) && !isCancellationRequested ? (
                                        <>
                                            {' '}
                                            <AgentOnboardingDemoOffer
                                                run={run}
                                            />
                                        </>
                                    ) : null}
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
                            title={t('run.setupStopped')}
                        >
                            {getStatusMessage(t, run)}
                        </Alert>
                    ) : null}

                    <Box className={classes.workspace}>
                        <Paper className={classes.panel}>
                            <Box className={classes.panelHeader}>
                                <Title order={5}>{t('run.progress')}</Title>
                            </Box>
                            <AgentOnboardingProgress run={run} />
                            <AgentOnboardingActivityPanel
                                key={run.agentOnboardingRunUuid}
                                events={run.events}
                            />
                        </Paper>

                        <Paper className={classes.panel}>
                            <Box className={classes.panelHeader}>
                                <Title order={5}>
                                    {t('run.generatedFiles')}
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    {t('run.fileCount', {
                                        count: run.files.length,
                                    })}
                                </Text>
                            </Box>
                            <Box className={classes.panelBody}>
                                <AgentOnboardingFileBrowser
                                    projectUuid={run.projectUuid}
                                    runUuid={run.agentOnboardingRunUuid}
                                    files={run.files}
                                    isLive={
                                        !isAgentOnboardingRunTerminal(
                                            run.status,
                                        )
                                    }
                                    latestActivity={
                                        run.events.at(-1)?.message ?? null
                                    }
                                />
                            </Box>
                        </Paper>
                    </Box>
                </Stack>
            </Box>
        </Page>
    );
};

export default AgentOnboardingRunPage;
