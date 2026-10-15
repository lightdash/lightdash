import { Anchor, Breadcrumbs, Button, Group, Stack, Text } from '@mantine/core';
import {
    IconGripVertical,
    IconPlayerPlay,
    IconPlus,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../../components/common/ResizableSplitter';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
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
    const { t } = useTranslation('aiCopilotAdmin');
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { agentUuid, evalUuid, runUuid } = useParams();
    const projectUuid = useProjectUuid();
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
            runEvaluationMutation.mutate(evalUuid);
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
                {t('evals.layout.evaluations')}
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
                {t('evals.layout.evaluations')}
            </Anchor>,
        );
    }

    if (isEvaluationDetail) {
        breadcrumbItems.push(
            <Text key="evaluation" size="lg" fw={500}>
                {evaluation?.title || t('evals.layout.evaluation')}
            </Text>,
        );
    } else if (isRunDetail) {
        breadcrumbItems.push(
            <Anchor
                key="evaluation"
                size="lg"
                onClick={handleNavigateToEvaluation}
                className={styles.breadcrumbLink}
                td="none"
                fw={500}
            >
                {evaluation?.title || t('evals.layout.evaluation')}
            </Anchor>,
        );
        breadcrumbItems.push(
            <Text key="run" size="lg" fw={500}>
                {t('evals.layout.run', { id: runUuid?.slice(-8) })}
            </Text>,
        );
    }

    let pageDescription = t('evals.layout.descriptions.list');

    if (isEvaluationDetail) {
        pageDescription = t('evals.layout.descriptions.detail');
    } else if (isRunDetail) {
        pageDescription = t('evals.layout.descriptions.run');
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
                    {t('evals.layout.runEvaluation')}
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
                    {t('evals.layout.createEvaluation')}
                </Button>
            );
        }

        return null;
    };

    return (
        <ResizableSplitter
            withHandle
            lineSize={1.5}
            handleColor="ldGray.2"
            handleIcon={
                <MantineIcon color="gray" icon={IconGripVertical} size="sm" />
            }
            classNames={{ handle: styles.resizeHandle }}
            orientation="horizontal"
        >
            <ResizableSplitter.Pane
                id="eval-content"
                defaultSize={isSidebarOpen ? 40 : 100}
                min={30}
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
            </ResizableSplitter.Pane>

            {isSidebarOpen && (
                <ResizableSplitter.Pane
                    id="thread-preview"
                    defaultSize={60}
                    min={25}
                    max={70}
                    className={styles.threadPanel}
                >
                    {!!selectedThreadUuid && !!projectUuid && !!agentUuid && (
                        <ThreadPreviewSidebar
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            threadUuid={selectedThreadUuid}
                            isOpen={isSidebarOpen}
                            onClose={handleCloseSidebar}
                            evalUuid={evalUuid}
                            runUuid={runUuid}
                        />
                    )}
                </ResizableSplitter.Pane>
            )}
        </ResizableSplitter>
    );
};
