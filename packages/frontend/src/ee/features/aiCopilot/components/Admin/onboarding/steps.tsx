import { Stack, Text } from '@mantine/core';
import { type TFunction } from 'i18next';
import { type GuidedTourStep } from '../../../../../../components/common/GuidedTour';
import { ReviewsLoopDiagram } from './ReviewsLoopDiagram';

// First-visit tour for the Issues board. All step copy lives here.
export const getReviewsTourSteps = (t: TFunction): GuidedTourStep[] => [
    {
        target: '[data-tour="reviews-intro"]',
        title: t('onboarding.tour.intro.title'),
        body: t('onboarding.tour.intro.body'),
    },
    {
        target: '[data-tour="reviews-card"]',
        title: t('onboarding.tour.card.title'),
        body: t('onboarding.tour.card.body'),
    },
    {
        target: '[data-tour="reviews-pr"]',
        title: t('onboarding.tour.pr.title'),
        body: t('onboarding.tour.pr.body'),
    },
    {
        target: '[data-tour="reviews-workspace"]',
        title: t('onboarding.tour.workspace.title'),
        body: t('onboarding.tour.workspace.body'),
    },
    {
        target: '[data-tour="reviews-in-progress"]',
        title: t('onboarding.tour.inProgress.title'),
        body: t('onboarding.tour.inProgress.body'),
    },
    {
        target: null,
        title: t('onboarding.tour.afterMerge.title'),
        body: (
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    {t('onboarding.tour.afterMerge.body')}
                </Text>
                <ReviewsLoopDiagram />
            </Stack>
        ),
    },
];
