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
        target: '[data-tour="dashboard-edit-history"]',
        title: 'Edit history',
        body: 'Undo and redo your layout changes one step at a time.',
    },
    {
        target: '[data-tour="dashboard-edit-changes"]',
        title: 'See every change',
        body: 'Once you change something, this turns into Unsaved changes. Click it for the full list of edits before you save.',
    },
    {
        target: '[data-tour="dashboard-edit-tiles"]',
        title: 'Add and tidy tiles',
        body: 'Add a tile, or tidy the layout to close the gaps.',
    },
    {
        target: '[data-tour="dashboard-edit-zoom"]',
        title: 'Zoom the canvas',
        body: 'Zoom out to arrange a long dashboard, or fit it to your screen.',
    },
    {
        target: '[data-tour="dashboard-edit-guides"]',
        title: 'Pick your guides',
        body: 'Switch between a grid, dots or column guides to line tiles up.',
    },
    {
        target: '[data-tour="dashboard-edit-filters"]',
        title: 'Show or hide filters',
        body: 'Collapse or hide the filters bar while you work on the layout.',
    },
];
