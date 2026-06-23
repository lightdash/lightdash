import { Stack, Text } from '@mantine-8/core';
import { type GuidedTourStep } from '../../../../../../components/common/GuidedTour';
import { ReviewsLoopDiagram } from './ReviewsLoopDiagram';

// First-visit tour for the Issues board. All step copy lives here.
export const REVIEWS_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: '[data-tour="reviews-intro"]',
        title: 'Start here',
        body: 'These are answers your agents probably got wrong. We group them by what caused them, and you work them left to right.',
    },
    {
        target: '[data-tour="reviews-card"]',
        title: 'Each card is one finding',
        body: 'Click a card to inspect the thread and the suggested fix. Semantic layer and Project context are the kinds you can usually fix from here.',
    },
    {
        target: '[data-tour="reviews-pr"]',
        title: 'Open a pull request',
        body: 'When a fix is ready, Start opens a pull request in your repo. The card moves to In Progress and tracks the PR.',
    },
    {
        target: '[data-tour="reviews-workspace"]',
        title: 'Follow the fix',
        body: 'Open the workspace to watch the fix come together and pick up where it left off.',
    },
    {
        target: '[data-tour="reviews-in-progress"]',
        title: 'Build and verify',
        body: 'In the workspace the fix builds in a throwaway preview, then your agent re-answers the original question to check it actually worked.',
    },
    {
        target: null,
        title: 'What happens after you merge',
        body: (
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    Merge and the card lands in Done. The agent uses the fix on
                    its next answer:
                </Text>
                <ReviewsLoopDiagram />
            </Stack>
        ),
    },
];
