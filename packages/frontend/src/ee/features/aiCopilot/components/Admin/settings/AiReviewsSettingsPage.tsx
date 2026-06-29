import {
    Button,
    Drawer,
    Group,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { IconLayoutKanban, IconRoute, IconTable } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { GuidedTour } from '../../../../../../components/common/GuidedTour';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { useGuidedTour } from '../../../../../../hooks/useGuidedTour';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminReviewItemsTable, {
    type AiAgentAdminReviewItemPreviewTarget,
} from '../AiAgentAdminReviewItemsTable';
import { REVIEWS_TOUR_STEPS } from '../onboarding';
import { ReviewKanbanBoard } from '../ReviewKanbanBoard';
import { ThreadPreviewSidebar } from '../ThreadPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const AiReviewsSettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();
    const [searchParams, setSearchParams] = useSearchParams();

    // The selected review item and the sidebar's open state are derived
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

    // Seeds the board/table project filter when arriving from a project's
    // "Review AI findings" promo (e.g. `?projects=<uuid>`).
    const initialProjectUuids = useMemo(() => {
        const projectsParam = searchParams.get('projects');
        if (!projectsParam) return [];
        return projectsParam.split(',').filter(Boolean);
    }, [searchParams]);

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
                            { title: 'Reviews', active: true },
                        ]}
                    />
                    <Group gap="xs">
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
                    An actionable queue of answers your agents probably got
                    wrong. Click a finding to inspect the thread, metadata, and
                    suggested fix.{' '}
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
                    initialProjectUuids={initialProjectUuids}
                />
            ) : (
                <AiAgentAdminReviewItemsTable
                    selectedReviewItemUuid={selectedReviewItem?.reviewItemUuid}
                    onReviewItemSelect={handleReviewItemSelect}
                    initialProjectUuids={initialProjectUuids}
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
        </Stack>
    );
};
