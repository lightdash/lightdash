import { type GuidedTourStep } from '../../GuidedTour';
import { EXAMPLE_CHANGES_LIST_TARGET } from './exampleData';
import { ToolbarIntro } from './ToolbarIntro';

export const DASHBOARD_EDIT_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: null,
        title: 'Welcome to the new dashboard editor',
        body: 'A new toolbar makes laying out a dashboard faster. Here is a quick look.',
    },
    {
        target: '[data-tour="dashboard-edit-bar"]',
        title: 'New edit toolbar',
        body: <ToolbarIntro />,
    },
    {
        target: null,
        highlights: [
            '[data-tour="dashboard-edit-history"]',
            '[data-tour="dashboard-edit-changes"]',
            EXAMPLE_CHANGES_LIST_TARGET,
        ],
        title: 'Edit history',
        body: 'Keep track of your changes with the new edit history. See what changed, and undo or redo without losing your work.',
    },
    {
        target: '[data-tour="dashboard-edit-tiles"]',
        title: 'Smart tile layout',
        body: 'Keep adding tiles and rearrange them easily with the new tidy layout.',
    },
    {
        target: '[data-tour="dashboard-edit-canvas"]',
        title: 'Grid helpers',
        body: 'Zoom out to see the full picture, and switch on a grid, dots or column guides to line your tiles up.',
    },
    {
        target: '[data-tour="dashboard-edit-filters"]',
        title: 'Focus on your tiles',
        body: 'Make space by hiding filters while you edit. This only changes edit mode, viewers still see every filter.',
    },
];
