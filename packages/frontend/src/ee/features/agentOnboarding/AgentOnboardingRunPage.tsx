import {
    FeatureFlags,
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
    IconTerminal2,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import PageSpinner from '../../../components/PageSpinner';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    AgentOnboardingCodePanel,
    type CodePanelView,
} from './AgentOnboardingCodePanel';
import { AgentOnboardingDemoOffer } from './AgentOnboardingDemoOffer';
import { RunChanges } from './AgentOnboardingRunChanges';
import { RunJourney } from './AgentOnboardingRunOverview';
import classes from './AgentOnboardingRunPage.module.css';
import { AgentOnboardingRunPageLegacy } from './AgentOnboardingRunPageLegacy';
import { RunSummary } from './AgentOnboardingRunSummary';
import { RunSemanticLayer } from './AgentOnboardingSemanticLayer';
import {
    useAgentOnboardingRun,
    useCancelAgentOnboardingRun,
    useStartAgentOnboardingRun,
} from './hooks/useAgentOnboarding';
import { useNow } from './hooks/useNow';
import { formatStageDuration, getAgentOnboardingRunUrl } from './utils';
import { setWatchedAgentOnboardingRun } from './watchedRunStore';

const RUN_COPY: Record<
    AgentOnboardingRunStatus,
    { pill: string; title: string; subtitle: string | null }
> = {
    queued: {
        pill: 'Queued',
        title: 'Getting ready to build your project',
        subtitle: 'Starting in a moment.',
    },
    running: {
        pill: 'Building',
        title: 'Building your project',
        subtitle: 'Takes a few minutes. It keeps going if you leave.',
    },
    completed: {
        pill: 'Ready',
        title: 'Your project is ready',
        subtitle: null,
    },
    failed: {
        pill: 'Stopped',
        title: 'Setup stopped',
        subtitle: 'What was built is kept. Try again to start over.',
    },
    cancelled: {
        pill: 'Cancelled',
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

const RunStatusPill: FC<{
    run: AgentOnboardingRun;
    isStopping: boolean;
}> = ({ run, isStopping }) => {
    const now = useNow(!isAgentOnboardingRunTerminal(run.status));
    const elapsedMs = getElapsedMs(run, now);
    return (
        <Group gap={8} wrap="nowrap" className={classes.pill}>
            <Box
                className={classes.statusDot}
                data-status={run.status}
                aria-hidden
            />
            <Text fz="xs" fw={500}>
                {isStopping ? 'Stopping' : RUN_COPY[run.status].pill}
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
    onViewCode: () => void;
    onViewLog: () => void;
    isCancelling: boolean;
    isRetrying: boolean;
}> = ({
    run,
    onCancel,
    onSkip,
    onRetry,
    onOpenProject,
    onViewCode,
    onViewLog,
    isCancelling,
    isRetrying,
}) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const menu = (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <ActionIcon
                    variant="default"
                    size={32}
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
                <Menu.Item
                    leftSection={<MantineIcon icon={IconTerminal2} />}
                    onClick={onViewLog}
                >
                    Run log
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
                    size="sm"
                    component={Link}
                    to={`/projects/${run.projectUuid}`}
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                >
                    Ask your first question
                </Button>
                {menu}
            </Group>
        );
    }

    return (
        <Group gap="xs" wrap="nowrap">
            <Button variant="default" size="sm" onClick={onOpenProject}>
                Open project
            </Button>
            <Button
                size="sm"
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

const AgentOnboardingRunPage: FC = () => {
    const { agentOnboardingRunUuid } = useParams();
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const [isCancellationRequested, setIsCancellationRequested] =
        useState(false);
    // The panel keeps its last view while closed so the sidebar can animate out
    const [panelView, setPanelView] = useState<CodePanelView | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const codeView = isPanelOpen ? panelView : null;
    const setCodeView = (view: CodePanelView | null) => {
        if (view) setPanelView(view);
        setIsPanelOpen(view !== null);
    };
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
    const viewFile = (path: string) => setCodeView({ kind: 'file', path });

    return (
        <Page
            title="Project setup"
            withPaddedContent
            withFullHeight
            rightSidebar={
                panelView ? (
                    <AgentOnboardingCodePanel
                        run={run}
                        view={panelView}
                        onChange={setCodeView}
                        onClose={() => setCodeView(null)}
                    />
                ) : undefined
            }
            isRightSidebarOpen={codeView !== null}
            onRightSidebarClose={() => setCodeView(null)}
            rightSidebarTitle="Project code"
            noRightSidebarPadding
            rightSidebarWidthProps={{
                defaultWidth: 760,
                minWidth: 320,
                maxWidth: 1100,
            }}
        >
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
                            <Group gap="xs" wrap="wrap">
                                <Title order={2} className={classes.title}>
                                    {copy.title}
                                </Title>
                                <RunStatusPill
                                    run={run}
                                    isStopping={isStopping}
                                />
                            </Group>
                            {(isStopping || copy.subtitle) && (
                                <Text c="dimmed" fz="sm">
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
                            onViewCode={() =>
                                setCodeView(
                                    run.files[0]
                                        ? {
                                              kind: 'file',
                                              path:
                                                  run.files.find(({ path }) =>
                                                      /models\//.test(path),
                                                  )?.path ?? run.files[0].path,
                                          }
                                        : { kind: 'log' },
                                )
                            }
                            onViewLog={() => setCodeView({ kind: 'log' })}
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

                    <Paper className={classes.journey}>
                        <RunJourney run={run} />
                        {run.status !== 'completed' && (
                            <RunChanges run={run} withModels={false} />
                        )}
                    </Paper>

                    {run.status === 'completed' && <RunSummary run={run} />}

                    <RunSemanticLayer
                        run={run}
                        inspectedPath={
                            codeView?.kind === 'file' ? codeView.path : null
                        }
                        onViewCode={viewFile}
                    />
                </Box>
            </Box>
        </Page>
    );
};

const AgentOnboardingRunRoute: FC = () => {
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    if (newOnboardingFlag.isInitialLoading) return <PageSpinner />;
    return newOnboardingFlag.data?.enabled === true ? (
        <AgentOnboardingRunPage />
    ) : (
        <AgentOnboardingRunPageLegacy />
    );
};

export default AgentOnboardingRunRoute;
