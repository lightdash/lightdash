import {
    Anchor,
    Breadcrumbs,
    Button,
    Group,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconGripVertical,
    IconPlayerPlay,
    IconPlus,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import {
    useAiAgentEvaluation,
    useAiAgentEvaluationRuns,
    useRunEvaluation,
} from '../../hooks/useAiAgentEvaluations';
import { useEvalSectionContext } from '../../hooks/useEvalSectionContext';
import { ThreadPreviewSidebar } from '../Admin/ThreadPreviewSidebar';
import styles from './EvalSectionLayout.module.css';

type EvalSectionLayoutProps = {
    children: ReactNode;
};

export const EvalSectionLayout: FC<EvalSectionLayoutProps> = ({ children }) => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { projectUuid, agentUuid, evalUuid, runUuid } = useParams<{
        projectUuid: string;
        agentUuid: string;
        evalUuid?: string;
        runUuid?: string;
    }>();
    const { selectedThreadUuid, isSidebarOpen, clearThread } =
        useEvalSectionContext();
    // Fetch evaluation data if we're on an eval detail page
    const { data: evaluation } = useAiAgentEvaluation(
        projectUuid!,
        agentUuid!,
        evalUuid!,
        {
            enabled: !!evalUuid,
        },
    );

    // Fetch evaluation runs for checking active runs
    const { data: runsData } = useAiAgentEvaluationRuns(
        projectUuid!,
        agentUuid!,
        evalUuid!,
        {
            enabled: !!evalUuid,
        },
    );

    const runEvaluationMutation = useRunEvaluation(projectUuid!, agentUuid!);

    // Check if there's an active evaluation running
    const hasActiveRun = runsData?.data?.runs?.some(
        (run) => run.status === 'pending' || run.status === 'running',
    );

    const handleCloseSidebar = () => {
        clearThread();
    };

    // Action handlers
    const handleCreateModalOpen = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('modal', 'create-eval');
        setSearchParams(newParams);
    };

    const handleRunEvaluation = () => {
        if (evalUuid) {
            void runEvaluationMutation.mutate(evalUuid);
        }
    };

    const handleNavigateToEvaluations = () => {
        void navigate(
            `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals`,
        );
    };

    const handleNavigateToEvaluation = () => {
        if (evalUuid) {
            void navigate(
                `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evalUuid}`,
            );
        }
    };

    // Determine the current page context
    const isEvaluationsList = !evalUuid;
    const isEvaluationDetail = evalUuid && !runUuid;
    const isRunDetail = evalUuid && runUuid;

    // Build breadcrumbs based on current context
    const breadcrumbItems = [];

    if (isEvaluationsList) {
        breadcrumbItems.push(
            <Text key="evaluations" size="lg" fw={500}>
                Evaluations
            </Text>,
        );
    } else {
        breadcrumbItems.push(
            <Anchor
                key="evaluations"
                size="lg"
                onClick={handleNavigateToEvaluations}
                td="none"
                fw={500}
            >
                Evaluations
            </Anchor>,
        );
    }

    if (isEvaluationDetail) {
        breadcrumbItems.push(
            <Text key="evaluation" size="lg" fw={500}>
                {evaluation?.title || 'Evaluation'}
            </Text>,
        );
    } else if (isRunDetail) {
        breadcrumbItems.push(
            <Anchor
                key="evaluation"
                size="lg"
                onClick={handleNavigateToEvaluation}
                style={{ cursor: 'pointer' }}
                td="none"
                fw={500}
            >
                {evaluation?.title || 'Evaluation'}
            </Anchor>,
        );
        breadcrumbItems.push(
            <Text key="run" size="lg" fw={500}>
                Run {runUuid?.slice(-8)}
            </Text>,
        );
    }

    let pageDescription =
        'Test your AI agent with predefined prompts and measure its performance across different scenarios.';

    if (isEvaluationDetail) {
        pageDescription =
            'Test your AI agent with predefined prompts and analyze its performance across multiple scenarios.';
    } else if (isRunDetail) {
        pageDescription =
            'View detailed results and performance metrics for this evaluation run.';
    }

    // Render appropriate action button based on current context
    const RenderActionButton = () => {
        if (isRunDetail) {
            return null; // No action button for run details
        }

        if (isEvaluationDetail) {
            return (
                <Button
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    size="sm"
                    loading={runEvaluationMutation.isLoading || hasActiveRun}
                    onClick={handleRunEvaluation}
                >
                    Run Evaluation
                </Button>
            );
        }

        if (isEvaluationsList) {
            return (
                <Button
                    leftSection={<MantineIcon icon={IconPlus} />}
                    size="sm"
                    onClick={handleCreateModalOpen}
                >
                    Create Evaluation
                </Button>
            );
        }

        return null;
    };

    return (
        <PanelGroup
            direction="horizontal"
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
        >
            <Panel
                id="eval-content"
                defaultSize={isSidebarOpen ? 40 : 100}
                minSize={30}
            >
                <Stack gap="sm" mt="lg" pr="md">
                    <Stack gap="md">
                        <Group justify="space-between" align="flex-start">
                            <Stack gap="xs">
                                <Breadcrumbs separator="/">
                                    {breadcrumbItems}
                                </Breadcrumbs>
                                <Text size="sm" c="dimmed">
                                    {pageDescription}
                                </Text>
                            </Stack>

                            <RenderActionButton />
                        </Group>
                    </Stack>
                    {children}
                </Stack>
            </Panel>

            {isSidebarOpen && (
                <>
                    <PanelResizeHandle
                        className={styles.resizeHandle}
                        style={{
                            width: 1.5,
                            backgroundColor: theme.colors.ldGray[2],
                            cursor: 'col-resize',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <MantineIcon
                            color="gray"
                            icon={IconGripVertical}
                            size="sm"
                        />
                    </PanelResizeHandle>
                    <Panel
                        id="thread-preview"
                        defaultSize={60}
                        minSize={25}
                        maxSize={70}
                        className={styles.threadPanel}
                    >
                        {!!selectedThreadUuid &&
                            !!projectUuid &&
                            !!agentUuid && (
                                <ThreadPreviewSidebar
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                    threadUuid={selectedThreadUuid}
                                    isOpen={isSidebarOpen}
                                    onClose={handleCloseSidebar}
                                    renderArtifactsInline
                                    evalUuid={evalUuid}
                                    runUuid={runUuid}
                                />
                            )}
                    </Panel>
                </>
            )}
        </PanelGroup>
    );
};
