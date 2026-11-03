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
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconArrowRight,
    IconChevronRight,
    IconDots,
    IconPlayerStop,
    IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useId, useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
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
import { RunSemanticLayer } from './AgentOnboardingSemanticLayer';
import {
    useAgentOnboardingRun,
    useCancelAgentOnboardingRun,
    useStartAgentOnboardingRun,
} from './hooks/useAgentOnboarding';
import { useNow } from './hooks/useNow';
import {
    formatStageDuration,
    getActiveStageLabel,
    getAgentOnboardingDashboardUrl,
    getAgentOnboardingRunUrl,
} from './utils';
import { setWatchedAgentOnboardingRun } from './watchedRunStore';

const RUN_COPY: Record<
    AgentOnboardingRunStatus,
    { pill: string; title: string; subtitle: string }
> = {
    queued: {
        pill: 'Queued',
        title: 'Getting ready to build your project',
        subtitle: `${AI_NAME} will start in a moment. You can leave this page, setup keeps going and home shows its progress.`,
    },
    running: {
        pill: 'Building',
        title: 'Building your project',
        subtitle:
            'This usually takes a few minutes. You can leave this page, setup keeps going and home shows its progress.',
    },
    completed: {
        pill: 'Ready',
        title: 'Your project is ready',
        subtitle:
            'Metrics, charts and a starter dashboard are live. Everything below is yours to edit.',
    },
    failed: {
        pill: 'Stopped',
        title: 'Setup stopped',
        subtitle:
            'Anything already built is kept. Try again and it starts from the top.',
    },
    cancelled: {
        pill: 'Cancelled',
        title: 'Setup cancelled',
        subtitle:
            'Nothing else will run. Anything already built is kept, and you can start again anytime.',
    },
};

const getElapsedMs = (run: AgentOnboardingRun, now: number): number | null => {
    const startedAt = Date.parse(run.startedAt ?? '');
    if (!Number.isFinite(startedAt)) return null;
    const endedAt = Date.parse(run.completedAt ?? '');
    return (Number.isFinite(endedAt) ? endedAt : now) - startedAt;
};

const RunPill: FC<{
    run: AgentOnboardingRun;
    now: number;
    isStopping: boolean;
}> = ({ run, now, isStopping }) => {
    const elapsedMs = getElapsedMs(run, now);
    const label = isStopping
        ? 'Stopping'
        : run.status === 'running'
          ? (getActiveStageLabel(run, now) ?? RUN_COPY.running.pill)
          : RUN_COPY[run.status].pill;
    return (
        <Group gap={8} wrap="nowrap" className={classes.pill}>
            <span className={classes.statusDot} data-status={run.status} />
            <Text fz="xs" fw={500}>
                {label}
            </Text>
            {elapsedMs !== null && (
                <Text fz="xs" c="dimmed" className={classes.tabular}>
                    {formatStageDuration(elapsedMs)}
                </Text>
            )}
        </Group>
    );
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
            <Group gap="xs" wrap="nowrap">
                <Button
                    variant="default"
                    component={Link}
                    to={`/projects/${run.projectUuid}/home`}
                >
                    Back to home
                </Button>
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <ActionIcon
                            variant="default"
                            size="lg"
                            aria-label="More setup options"
                            loading={isCancelling}
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item onClick={() => void onSkip()}>
                            Stop and open the project
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconPlayerStop} />}
                            onClick={() => void onCancel()}
                        >
                            Cancel setup
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        );
    }

    if (run.status === 'completed') {
        return (
            <Group gap="xs" wrap="nowrap">
                <Button
                    variant="default"
                    component={Link}
                    to={`/projects/${run.projectUuid}/tables`}
                >
                    Explore metrics
                </Button>
                <Button
                    component={Link}
                    to={getAgentOnboardingDashboardUrl(run.projectUuid)}
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                >
                    Open starter dashboard
                </Button>
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
        </Group>
    );
};

const TechnicalDetails: FC<{ run: AgentOnboardingRun }> = ({ run }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'files' | 'log'>('files');
    const panelId = useId();
    return (
        <Box>
            <UnstyledButton
                className={classes.detailsToggle}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setIsOpen((value) => !value)}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    className={classes.detailsChevron}
                    data-open={isOpen}
                />
                <Text fz="sm" fw={500}>
                    Files and log
                </Text>
                <Text fz="xs" c="dimmed">
                    {run.files.length === 1
                        ? '1 file'
                        : `${run.files.length} files`}
                    {' · '}
                    {run.events.length === 1
                        ? '1 event'
                        : `${run.events.length} events`}
                </Text>
            </UnstyledButton>
            {isOpen && (
                <Paper id={panelId} className={classes.details}>
                    <Box className={classes.detailsHeader}>
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
                    </Box>
                    <Box className={classes.detailsBody}>
                        {view === 'files' ? (
                            <AgentOnboardingFileBrowser
                                projectUuid={run.projectUuid}
                                runUuid={run.agentOnboardingRunUuid}
                                files={run.files}
                                isLive={
                                    !isAgentOnboardingRunTerminal(run.status)
                                }
                                latestActivity={
                                    run.events.at(-1)?.message ?? null
                                }
                            />
                        ) : (
                            <AgentOnboardingActivityPanel
                                key={run.agentOnboardingRunUuid}
                                events={run.events}
                            />
                        )}
                    </Box>
                </Paper>
            )}
        </Box>
    );
};

const AgentOnboardingRunPage: FC = () => {
    const { agentOnboardingRunUuid } = useParams();
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const [isCancellationRequested, setIsCancellationRequested] =
        useState(false);
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
                        <Stack gap="sm" className={classes.headerText}>
                            <RunPill
                                run={run}
                                now={now}
                                isStopping={isStopping}
                            />
                            <Title order={2} className={classes.title}>
                                {copy.title}
                            </Title>
                            <Text c="dimmed" fz="sm" maw={560}>
                                {isStopping
                                    ? 'Stopping the setup run…'
                                    : copy.subtitle}
                                {isLive && !isStopping && (
                                    <>
                                        {' '}
                                        <AgentOnboardingDemoOffer run={run} />
                                    </>
                                )}
                            </Text>
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

                    <RunSemanticLayer run={run} />

                    <Stack gap="sm">
                        <Text fz="sm" fw={500}>
                            {run.status === 'completed'
                                ? 'Charts and notes'
                                : 'Charts and tables'}
                        </Text>
                        <Paper className={classes.changes}>
                            <RunChanges run={run} withModels={false} />
                        </Paper>
                    </Stack>

                    <TechnicalDetails run={run} />
                </Box>
            </Box>
        </Page>
    );
};

export default AgentOnboardingRunPage;
