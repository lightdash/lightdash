import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
    type AgentOnboardingRunStatus,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Group,
    Menu,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconArrowRight,
    IconCode,
    IconDots,
    IconPlayerStop,
    IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import Page from '../../../components/common/Page/Page';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import PageSpinner from '../../../components/PageSpinner';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { AgentOnboardingActivityPanel } from './AgentOnboardingActivity';
import { AgentOnboardingDemoOffer } from './AgentOnboardingDemoOffer';
import { AgentOnboardingFileBrowser } from './AgentOnboardingFileBrowser';
import { RunChanges } from './AgentOnboardingRunChanges';
import { RunJourney } from './AgentOnboardingRunOverview';
import classes from './AgentOnboardingRunPage.module.css';
import { RunSummary } from './AgentOnboardingRunSummary';
import { RunSemanticLayer } from './AgentOnboardingSemanticLayer';
import {
    useAgentOnboardingRun,
    useCancelAgentOnboardingRun,
    useStartAgentOnboardingRun,
} from './hooks/useAgentOnboarding';
import { useNow } from './hooks/useNow';
import {
    formatStageDuration,
    getAgentOnboardingDashboardUrl,
    getAgentOnboardingRunUrl,
} from './utils';
import { setWatchedAgentOnboardingRun } from './watchedRunStore';

const RUN_COPY: Record<
    AgentOnboardingRunStatus,
    { elapsed: string | null; title: string; subtitle: string | null }
> = {
    queued: {
        elapsed: null,
        title: 'Getting ready to build your project',
        subtitle: 'Starting in a moment.',
    },
    running: {
        elapsed: '',
        title: 'Building your project',
        subtitle: 'Takes a few minutes. It keeps going if you leave.',
    },
    completed: {
        elapsed: 'Built in ',
        title: 'Your project is ready',
        subtitle: null,
    },
    failed: {
        elapsed: 'Stopped after ',
        title: 'Setup stopped',
        subtitle: 'What was built is kept. Try again to start over.',
    },
    cancelled: {
        elapsed: 'Cancelled after ',
        title: 'Setup cancelled',
        subtitle: 'What was built is kept.',
    },
};

const getElapsedMs = (run: AgentOnboardingRun, now: number): number | null => {
    const startedAt = Date.parse(run.startedAt ?? '');
    if (!Number.isFinite(startedAt)) return null;
    const endedAt = Date.parse(run.completedAt ?? '');
    return (Number.isFinite(endedAt) ? endedAt : now) - startedAt;
};

const RunElapsed: FC<{ run: AgentOnboardingRun; now: number }> = ({
    run,
    now,
}) => {
    const elapsedMs = getElapsedMs(run, now);
    const prefix = RUN_COPY[run.status].elapsed;
    if (elapsedMs === null || prefix === null) return null;
    return (
        <Text fz="sm" c="dimmed" className={classes.tabular}>
            {prefix}
            {formatStageDuration(elapsedMs)}
        </Text>
    );
};

const RunActions: FC<{
    run: AgentOnboardingRun;
    onCancel: () => Promise<void>;
    onSkip: () => Promise<void>;
    onRetry: () => Promise<void>;
    onOpenProject: () => void;
    onViewCode: () => void;
    isCancelling: boolean;
    isRetrying: boolean;
}> = ({
    run,
    onCancel,
    onSkip,
    onRetry,
    onOpenProject,
    onViewCode,
    isCancelling,
    isRetrying,
}) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const menu = (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <ActionIcon
                    variant="default"
                    size="input-sm"
                    aria-label="More setup options"
                    loading={isCancelling}
                >
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconCode} />}
                    onClick={onViewCode}
                >
                    View code
                </Menu.Item>
                {isLive && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconArrowRight} />}
                            onClick={() => void onSkip()}
                        >
                            Stop and open the project
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconPlayerStop} />}
                            onClick={() => void onCancel()}
                        >
                            Cancel setup
                        </Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );

    if (isLive) return menu;

    if (run.status === 'completed') {
        return (
            <Group gap="xs" wrap="nowrap">
                <Button
                    component={Link}
                    to={getAgentOnboardingDashboardUrl(run.projectUuid)}
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                >
                    Open starter dashboard
                </Button>
                {menu}
            </Group>
        );
    }

    return (
        <Group gap="xs" wrap="nowrap">
            <Button variant="default" onClick={onOpenProject}>
                Open project
            </Button>
            <Button
                leftSection={<MantineIcon icon={IconRefresh} />}
                onClick={() => void onRetry()}
                loading={isRetrying}
            >
                {run.status === 'failed' ? 'Try again' : 'Start again'}
            </Button>
            {menu}
        </Group>
    );
};

const RunFilesModal: FC<{
    run: AgentOnboardingRun;
    opened: boolean;
    onClose: () => void;
}> = ({ run, opened, onClose }) => {
    const [view, setView] = useState<'files' | 'log'>('files');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Project code"
            icon={IconCode}
            size="90%"
            cancelLabel="Close"
            headerActions={
                <SegmentedControl
                    size="xs"
                    value={view}
                    onChange={(value) =>
                        setView(value === 'log' ? 'log' : 'files')
                    }
                    data={[
                        {
                            value: 'files',
                            label: `Files (${run.files.length})`,
                        },
                        { value: 'log', label: 'Log' },
                    ]}
                />
            }
            modalBodyProps={{ p: 0 }}
        >
            <Box className={classes.detailsBody}>
                {view === 'files' ? (
                    <AgentOnboardingFileBrowser
                        projectUuid={run.projectUuid}
                        runUuid={run.agentOnboardingRunUuid}
                        files={run.files}
                        isLive={!isAgentOnboardingRunTerminal(run.status)}
                        latestActivity={run.events.at(-1)?.message ?? null}
                    />
                ) : (
                    <AgentOnboardingActivityPanel
                        key={run.agentOnboardingRunUuid}
                        events={run.events}
                    />
                )}
            </Box>
        </MantineModal>
    );
};

const AgentOnboardingRunPage: FC = () => {
    const { agentOnboardingRunUuid } = useParams();
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const [isCancellationRequested, setIsCancellationRequested] =
        useState(false);
    const [isFilesOpen, setIsFilesOpen] = useState(false);
    const runQuery = useAgentOnboardingRun(projectUuid, agentOnboardingRunUuid);
    const cancelMutation = useCancelAgentOnboardingRun();
    const startMutation = useStartAgentOnboardingRun();

    const runStatus = runQuery.data?.status;
    const now = useNow(!!runStatus && !isAgentOnboardingRunTerminal(runStatus));
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
            <Page title="Project setup" withPaddedContent>
                <Alert color="red" icon={<IconAlertCircle />}>
                    This onboarding run could not be found.
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

    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const isStopping = isCancellationRequested && isLive;
    const copy = RUN_COPY[run.status];

    return (
        <Page title="Project setup" withPaddedContent fullPageScroll>
            <Box className={classes.page}>
                <Box className={classes.column}>
                    <PageBreadcrumbs
                        size="sm"
                        items={[
                            {
                                title: 'Home',
                                to: `/projects/${run.projectUuid}/home`,
                            },
                            { title: 'Project setup', active: true },
                        ]}
                    />

                    <Box className={classes.header}>
                        <Stack gap={4} className={classes.headerText}>
                            <Group gap="sm" wrap="wrap">
                                <Title order={2} className={classes.title}>
                                    {copy.title}
                                </Title>
                                <RunElapsed run={run} now={now} />
                            </Group>
                            {(isStopping || copy.subtitle) && (
                                <Text c="dimmed" fz="sm" maw={560}>
                                    {isStopping
                                        ? 'Stopping the setup run…'
                                        : copy.subtitle}
                                    {isLive && !isStopping && (
                                        <>
                                            {' '}
                                            <AgentOnboardingDemoOffer
                                                run={run}
                                            />
                                        </>
                                    )}
                                </Text>
                            )}
                        </Stack>
                        <RunActions
                            run={run}
                            onCancel={cancel}
                            onSkip={skip}
                            onRetry={retry}
                            onOpenProject={openProject}
                            isCancelling={
                                cancelMutation.isLoading || isStopping
                            }
                            isRetrying={startMutation.isLoading}
                            onViewCode={() => setIsFilesOpen(true)}
                        />
                    </Box>

                    {run.status === 'failed' && (
                        <Paper className={classes.problem}>
                            <MantineIcon
                                icon={IconAlertTriangle}
                                size={16}
                                className={classes.problemIcon}
                            />
                            <Text fz="sm">
                                {run.errorMessage ??
                                    'The setup run could not be completed.'}
                            </Text>
                        </Paper>
                    )}

                    <RunJourney run={run} now={now} />

                    {run.status === 'completed' ? (
                        <RunSummary run={run} />
                    ) : (
                        <Stack gap="sm">
                            <Text fz="sm" fw={500}>
                                Charts and tables
                            </Text>
                            <Paper className={classes.changes}>
                                <RunChanges run={run} withModels={false} />
                            </Paper>
                        </Stack>
                    )}

                    <RunSemanticLayer run={run} />

                    <RunFilesModal
                        run={run}
                        opened={isFilesOpen}
                        onClose={() => setIsFilesOpen(false)}
                    />
                </Box>
            </Box>
        </Page>
    );
};

export default AgentOnboardingRunPage;
