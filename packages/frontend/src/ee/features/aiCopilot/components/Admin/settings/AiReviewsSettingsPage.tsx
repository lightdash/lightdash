import {
    type AiAgentReviewItemPriority,
    type AiAgentRootCause,
} from '@lightdash/common';
import {
    Button,
    Drawer,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import {
    IconLayoutKanban,
    IconPlus,
    IconRoute,
    IconTable,
} from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { GuidedTour } from '../../../../../../components/common/GuidedTour';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../../components/common/MantineModal';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { useGuidedTour } from '../../../../../../hooks/useGuidedTour';
import { useProjects } from '../../../../../../hooks/useProjects';
import {
    useAiAgentAdminAgents,
    useCreateAiAgentReviewItem,
} from '../../../hooks/useAiAgentAdmin';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminReviewItemsTable, {
    type AiAgentAdminReviewItemPreviewTarget,
} from '../AiAgentAdminReviewItemsTable';
import { REVIEWS_TOUR_STEPS } from '../onboarding';
import { ReviewKanbanBoard } from '../ReviewKanbanBoard';
import { ThreadPreviewSidebar } from '../ThreadPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

const rootCauseOptions: { value: AiAgentRootCause; label: string }[] = [
    { value: 'semantic_layer', label: 'Semantic layer' },
    { value: 'project_context', label: 'Project context' },
    { value: 'agent_configuration', label: 'Agent configuration' },
    { value: 'product_capability', label: 'Product capability' },
    { value: 'runtime_reliability', label: 'Runtime reliability' },
    { value: 'feedback_quality', label: 'Feedback quality' },
    { value: 'not_a_failure', label: 'Not a failure' },
    { value: 'ambiguous', label: 'Ambiguous' },
];

const priorityOptions: { value: AiAgentReviewItemPriority; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

export const AiReviewsSettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();
    const { data: projects = [] } = useProjects();
    const { data: agents = [] } = useAiAgentAdminAgents();
    const createIssue = useCreateAiAgentReviewItem();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [projectUuid, setProjectUuid] = useState<string | null>(null);
    const [agentUuid, setAgentUuid] = useState<string | null>(null);
    const [primaryRootCause, setPrimaryRootCause] =
        useState<AiAgentRootCause | null>(null);
    const [priority, setPriority] = useState<AiAgentReviewItemPriority>('none');

    // The selected issue and the sidebar's open state are derived
    // directly from the URL — every mutation (deep-link, row select, close)
    // goes through `setSearchParams`, so there's no separate state to sync.
    const selectedReviewItem = useMemo(() => {
        const projectUuid = searchParams.get('reviewProjectUuid');
        const agentUuid = searchParams.get('reviewAgentUuid');
        const threadUuid = searchParams.get('reviewThreadUuid');
        const reviewItemUuid = searchParams.get('reviewItemUuid');

        if (!projectUuid || !agentUuid || !threadUuid || !reviewItemUuid) {
            return null;
        }

        return {
            projectUuid,
            agentUuid,
            threadUuid,
            reviewItemUuid,
        };
    }, [searchParams]);

    const isSidebarOpen = selectedReviewItem !== null;

    // While the tour runs, the board always shows the same sample cards so the
    // spotlights land every time. Closing it flips back to real data.
    const {
        isOpen: isTourOpen,
        startTour,
        closeTour,
    } = useGuidedTour({ storageKey: 'ld.aiReviews.tour.v2' });

    const [view, setView] = useLocalStorage<'board' | 'table'>({
        key: 'ld.aiReviews.view',
        defaultValue: 'board',
    });

    // The board-oriented tour anchors only resolve on the board, so force it
    // while the tour runs (render-time only — the user's stored view is kept).
    const effectiveView = isTourOpen ? 'board' : view;

    const updateReviewSearchParams = (
        reviewItem: AiAgentAdminReviewItemPreviewTarget | null,
    ) => {
        const nextParams = new URLSearchParams(searchParams);

        nextParams.delete('reviewProjectUuid');
        nextParams.delete('reviewAgentUuid');
        nextParams.delete('reviewThreadUuid');
        nextParams.delete('reviewItemUuid');

        if (reviewItem) {
            nextParams.set('reviewProjectUuid', reviewItem.projectUuid);
            nextParams.set('reviewAgentUuid', reviewItem.agentUuid);
            nextParams.set('reviewThreadUuid', reviewItem.threadUuid);
            if (reviewItem.reviewItemUuid) {
                nextParams.set('reviewItemUuid', reviewItem.reviewItemUuid);
            }
        }

        setSearchParams(nextParams, { replace: true });
    };

    const handleReviewItemSelect = (
        reviewItem: AiAgentAdminReviewItemPreviewTarget,
    ): void => {
        updateReviewSearchParams(reviewItem);
    };

    const handleCloseSidebar = () => {
        updateReviewSearchParams(null);
    };

    const resetCreateForm = () => {
        setTitle('');
        setDescription('');
        setProjectUuid(null);
        setAgentUuid(null);
        setPrimaryRootCause(null);
        setPriority('none');
    };

    const handleCreateIssue = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!projectUuid || title.trim().length === 0) return;
        createIssue.mutate(
            {
                title: title.trim(),
                description: description.trim() || null,
                projectUuid,
                agentUuid,
                assignedToUserUuid: null,
                primaryRootCause,
                priority,
            },
            {
                onSuccess: () => {
                    resetCreateForm();
                    setIsCreateOpen(false);
                },
            },
        );
    };

    const agentOptions = agents
        .filter((agent) => !projectUuid || agent.projectUuid === projectUuid)
        .map((agent) => ({ value: agent.uuid, label: agent.name }));

    return (
        <Stack mb="lg" gap="md">
            <Stack gap={4} data-tour="reviews-intro">
                <Group justify="space-between" align="flex-start">
                    <PageBreadcrumbs
                        items={[
                            {
                                title: 'Ask AI',
                                to: '/generalSettings/ai/general',
                            },
                            { title: 'Issues', active: true },
                        ]}
                    />
                    <Group gap="xs">
                        <Button
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setIsCreateOpen(true)}
                        >
                            New issue
                        </Button>
                        <SegmentedControl
                            size="xs"
                            value={effectiveView}
                            onChange={(value) =>
                                setView(value as 'board' | 'table')
                            }
                            data={[
                                {
                                    value: 'board',
                                    label: (
                                        <Group gap={6} wrap="nowrap">
                                            <MantineIcon
                                                icon={IconLayoutKanban}
                                            />
                                            Board
                                        </Group>
                                    ),
                                },
                                {
                                    value: 'table',
                                    label: (
                                        <Group gap={6} wrap="nowrap">
                                            <MantineIcon icon={IconTable} />
                                            Table
                                        </Group>
                                    ),
                                },
                            ]}
                        />
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconRoute} />}
                            onClick={startTour}
                        >
                            Take the tour
                        </Button>
                    </Group>
                </Group>

                <Text c="dimmed" fz="sm" maw={760}>
                    An actionable queue of data issues from AI findings and
                    human asks. Open an issue to inspect the thread, metadata,
                    and suggested fix.{' '}
                    <Text span fw={600} fz="inherit">
                        Semantic layer
                    </Text>{' '}
                    fixes open a dbt PR.{' '}
                    <Text span fw={600} fz="inherit">
                        Project context
                    </Text>{' '}
                    fixes add a note your agents read before answering.
                </Text>
            </Stack>

            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            {effectiveView === 'board' ? (
                <ReviewKanbanBoard
                    selectedReviewItemUuid={selectedReviewItem?.reviewItemUuid}
                    onReviewItemSelect={handleReviewItemSelect}
                    showOnboardingExamples={isTourOpen}
                />
            ) : (
                <AiAgentAdminReviewItemsTable
                    selectedReviewItemUuid={selectedReviewItem?.reviewItemUuid}
                    onReviewItemSelect={handleReviewItemSelect}
                />
            )}

            <GuidedTour
                steps={REVIEWS_TOUR_STEPS}
                opened={isTourOpen}
                onClose={closeTour}
            />

            <Drawer
                opened={isSidebarOpen}
                onClose={handleCloseSidebar}
                position="right"
                size="lg"
                withCloseButton={false}
                padding={0}
                classNames={{
                    inner: drawerClasses.inner,
                    overlay: drawerClasses.overlay,
                }}
                __vars={{
                    '--drawer-top-offset': `${NAVBAR_HEIGHT}px`,
                }}
            >
                {!!selectedReviewItem && (
                    <ThreadPreviewSidebar
                        projectUuid={selectedReviewItem.projectUuid}
                        agentUuid={selectedReviewItem.agentUuid}
                        threadUuid={selectedReviewItem.threadUuid}
                        selectedReviewItemUuid={
                            selectedReviewItem.reviewItemUuid ?? undefined
                        }
                        isOpen={isSidebarOpen}
                        onClose={handleCloseSidebar}
                        showAddToEvalsButton
                    />
                )}
            </Drawer>

            <MantineModal
                opened={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                title="New issue"
                icon={IconPlus}
                size="lg"
            >
                <form onSubmit={handleCreateIssue}>
                    <Stack gap="sm">
                        <TextInput
                            label="Title"
                            value={title}
                            onChange={(event) =>
                                setTitle(event.currentTarget.value)
                            }
                            required
                            autoFocus
                        />
                        <Textarea
                            label="Description"
                            value={description}
                            onChange={(event) =>
                                setDescription(event.currentTarget.value)
                            }
                            minRows={4}
                        />
                        <Select
                            label="Project"
                            data={projects.map((project) => ({
                                value: project.projectUuid,
                                label: project.name,
                            }))}
                            value={projectUuid}
                            onChange={(value) => {
                                setProjectUuid(value);
                                setAgentUuid(null);
                            }}
                            searchable
                            required
                        />
                        <Select
                            label="Agent"
                            data={agentOptions}
                            value={agentUuid}
                            onChange={setAgentUuid}
                            searchable
                            clearable
                            disabled={!projectUuid}
                        />
                        <Select
                            label="Root cause"
                            data={rootCauseOptions}
                            value={primaryRootCause}
                            onChange={(value) =>
                                setPrimaryRootCause(
                                    value as AiAgentRootCause | null,
                                )
                            }
                            clearable
                        />
                        <Select
                            label="Priority"
                            data={priorityOptions}
                            value={priority}
                            onChange={(value) =>
                                setPriority(
                                    (value ??
                                        'none') as AiAgentReviewItemPriority,
                                )
                            }
                        />
                        <Group justify="flex-end">
                            <Button
                                variant="subtle"
                                color="gray"
                                onClick={() => setIsCreateOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={createIssue.isLoading}
                                disabled={!projectUuid || !title.trim()}
                            >
                                Create issue
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </MantineModal>
        </Stack>
    );
};
