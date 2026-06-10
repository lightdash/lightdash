import { Button, Drawer, Group, Stack, Text } from '@mantine-8/core';
import { IconRoute } from '@tabler/icons-react';
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

    // While the tour is running, the table always shows sample rows so it
    // highlights the same findings every time. Closing it flips to real data.
    const {
        isOpen: isTourOpen,
        startTour,
        closeTour,
    } = useGuidedTour({ storageKey: 'ld.aiReviews.tour.v1' });

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

                <Text c="dimmed" fz="sm" maw={760}>
                    Answers your agents probably got wrong, grouped by what
                    caused them.{' '}
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

            <AiAgentAdminReviewItemsTable
                selectedReviewItemUuid={selectedReviewItem?.reviewItemUuid}
                onReviewItemSelect={handleReviewItemSelect}
                showOnboardingExamples={isTourOpen}
            />

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
