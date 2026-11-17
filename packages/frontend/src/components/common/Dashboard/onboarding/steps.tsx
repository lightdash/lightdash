import { type GuidedTourStep } from '../../GuidedTour';
import { ToolbarIntro } from './ToolbarIntro';

export const DASHBOARD_EDIT_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: null,
        title: 'Welcome to the new dashboard editor',
        body: 'A new toolbar makes laying out a dashboard faster. Here is a quick look.',
    },
    {
        target: '[data-tour="dashboard-edit-bar"]',
        title: 'Meet the edit toolbar',
        body: <ToolbarIntro />,
    },
    {
        target: null,
        highlights: [
            '[data-tour="dashboard-edit-history"]',
            '[data-tour="dashboard-edit-changes"]',
        ],
        title: 'Edit history',
        body: 'Undo and redo your changes from the toolbar. Once you change something, Editing at the top lists every unsaved edit.',
    },
    {
        target: '[data-tour="dashboard-edit-tiles"]',
        title: 'Add and tidy tiles',
        body: 'Add a tile, or tidy the layout to close the gaps.',
    },
    {
        target: '[data-tour="dashboard-edit-canvas"]',
        title: 'Zoom and guides',
        body: 'Zoom out to arrange a long dashboard, and pick a grid, dots or column guides to line tiles up.',
    },
    {
        target: '[data-tour="dashboard-edit-filters"]',
        title: 'Show or hide filters',
        body: 'Collapse or hide the filters bar while you work on the layout.',
    },
];
