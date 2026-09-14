import { type GuidedTourStep } from '../../../../../../components/common/GuidedTour';

export const MEMORY_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: '[data-tour="memories-header-button"]',
        title: 'Your agents remember',
        body: 'As you chat, agents save useful facts about you and how you like your data. Open Memories any time to see what they have picked up.',
    },
    {
        target: '[data-tour="my-memories-modal"]',
        title: 'Review and manage memories',
        body: 'These are the memories agents saved from your conversations. Select one to see the details, and retire anything you no longer want agents to use.',
    },
];
