import { Button, Group, SegmentedControl, Stack } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import {
    IconLayoutKanban,
    IconPlus,
    IconRoute,
    IconTable,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { GuidedTour } from '../../../../../../components/common/GuidedTour';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    SettingsPage,
    SettingsPageActions,
} from '../../../../../../components/common/Settings/SettingsPage';
import { useGuidedTour } from '../../../../../../hooks/useGuidedTour';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import { openCreateIssue } from '../../../store/createIssueSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';
import AiAgentAdminReviewItemsTable, {
    type AiAgentAdminReviewItemPreviewTarget,
} from '../AiAgentAdminReviewItemsTable';
import { IssueDetailModal } from '../IssueDetailModal';
import { REVIEWS_TOUR_STEPS } from '../onboarding';
import { ReviewKanbanBoard } from '../ReviewKanbanBoard';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';

export const AiReviewsSettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();
    const dispatch = useAiAgentStoreDispatch();
    const [searchParams, setSearchParams] = useSearchParams();

    // The selected issue and the sidebar's open state are derived
    // directly from the URL — every mutation (deep-link, row select, close)
    // goes through `setSearchParams`, so there's no separate state to sync.
    const selectedReviewItem = useMemo(() => {
        const projectUuid = searchParams.get('reviewProjectUuid');
        const agentUuid = searchParams.get('reviewAgentUuid');
        const threadUuid = searchParams.get('reviewThreadUuid');
        const reviewItemUuid = searchParams.get('reviewItemUuid');

        // Manual issues have no source thread, so only the item uuid is
        // required; thread coordinates are present for AI findings only.
        if (!reviewItemUuid) {
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
    //
    // Deep-linking straight to a review opens the sidebar on mount; the tour
    // anchors the board behind it, so don't auto-fire it over an open sidebar.
    // The hook only reads `autoStartOnFirstVisit` once (mount), and we don't
    // mark the tour seen, so it still auto-fires on a later board-only visit.
    const {
        isOpen: isTourOpen,
        startTour,
        closeTour,
    } = useGuidedTour({
        storageKey: 'ld.aiReviews.tour.v2',
        autoStartOnFirstVisit: !isSidebarOpen,
    });

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
            if (reviewItem.projectUuid) {
                nextParams.set('reviewProjectUuid', reviewItem.projectUuid);
            }
            if (reviewItem.agentUuid) {
                nextParams.set('reviewAgentUuid', reviewItem.agentUuid);
            }
            if (reviewItem.threadUuid) {
                nextParams.set('reviewThreadUuid', reviewItem.threadUuid);
            }
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
            <div data-tour="reviews-intro">
                <SettingsPage
                    title="Issues"
                    description={
                        <>
                            An actionable queue of data issues from AI findings
                            and human asks. Semantic layer fixes open a dbt pull
                            request; project context fixes add guidance your
                            agents read before answering.
                        </>
                    }
                    actions={
                        <SettingsPageActions>
                            <Button
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={() => dispatch(openCreateIssue(null))}
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
                                size="xs"
                                leftSection={<MantineIcon icon={IconRoute} />}
                                onClick={startTour}
                            >
                                Take the tour
                            </Button>
                        </SettingsPageActions>
                    }
                >
                    {settings?.aiAgentsVisible === false && (
                        <AiFeaturesDisabledAlert />
                    )}

                    {effectiveView === 'board' ? (
                        <ReviewKanbanBoard
                            selectedReviewItemUuid={
                                selectedReviewItem?.reviewItemUuid
                            }
                            onReviewItemSelect={handleReviewItemSelect}
                            showOnboardingExamples={isTourOpen}
                            initialProjectUuids={initialProjectUuids}
                        />
                    ) : (
                        <AiAgentAdminReviewItemsTable
                            selectedReviewItemUuid={
                                selectedReviewItem?.reviewItemUuid
                            }
                            onReviewItemSelect={handleReviewItemSelect}
                            initialProjectUuids={initialProjectUuids}
                        />
                    )}
                </SettingsPage>
            </div>

            <GuidedTour
                steps={REVIEWS_TOUR_STEPS}
                opened={isTourOpen}
                onClose={closeTour}
            />

            {!!selectedReviewItem && (
                <IssueDetailModal
                    projectUuid={selectedReviewItem.projectUuid}
                    agentUuid={selectedReviewItem.agentUuid}
                    threadUuid={selectedReviewItem.threadUuid}
                    selectedReviewItemUuid={selectedReviewItem.reviewItemUuid}
                    isOpen={isSidebarOpen}
                    onClose={handleCloseSidebar}
                />
            )}
        </Stack>
    );
};
