import { Stack, Text } from '@mantine-8/core';
import { type GuidedTourStep } from '../../../../../../components/common/GuidedTour';
import { ReviewsLoopDiagram } from './ReviewsLoopDiagram';

// First-visit tour for the Reviews page. All step copy lives here.
export const REVIEWS_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: '[data-tour="reviews-intro"]',
        title: 'Start here',
        body: 'These are answers your agents probably got wrong. We group them by what caused them, so you can see what is worth your time.',
    },
    {
        target: '[data-tour="reviews-row"]',
        title: 'Each row is a finding',
        body: 'One answer your agent likely got wrong, tagged by its cause. Two kinds, Semantic layer and Project context, you can fix without leaving this page. The rest tell you where to look.',
    },
    {
        target: '[data-tour="reviews-create-pr"]',
        title: 'Fix it right here',
        body: 'When something is fixable, this button opens a pull request. Merge it and the fix reaches your agent.',
    },
    {
        target: null,
        title: 'What happens after you merge',
        body: (
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    Merging the PR adds the fix to your project. The agent uses
                    it on its next answer:
                </Text>
                <ReviewsLoopDiagram />
            </Stack>
        ),
    },
];
