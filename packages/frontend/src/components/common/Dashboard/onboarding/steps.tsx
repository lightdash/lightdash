import { type FloatingPosition } from '@mantine/core';
import { type ReactNode } from 'react';
import { EXAMPLE_CHANGES_LIST_TARGET } from './exampleData';
import { ToolbarIntro } from './ToolbarIntro';

export type DashboardEditTourStep = {
    /** CSS selector of the control to spotlight; null centers the card. */
    target: string | null;
    title: string;
    body: ReactNode;
    position: FloatingPosition;
};

export const DASHBOARD_EDIT_TOUR_STEPS: DashboardEditTourStep[] = [
    {
        target: null,
        title: 'Welcome to the new dashboard editor',
        body: 'A new toolbar makes laying out a dashboard faster. Here is a quick look.',
        position: 'bottom',
    },
    {
        target: '[data-tour="dashboard-edit-bar"]',
        title: 'New edit toolbar',
        body: <ToolbarIntro />,
        position: 'top',
    },
    {
        target: EXAMPLE_CHANGES_LIST_TARGET,
        title: 'Edit history',
        body: 'Keep track of your changes with the new edit history. See what changed, and undo or redo without losing your work.',
        position: 'left',
    },
    {
        target: '[data-tour="dashboard-edit-tiles"]',
        title: 'Smart tile layout',
        body: 'Keep adding tiles and rearrange them easily with the new tidy layout.',
        position: 'top',
    },
    {
        target: '[data-tour="dashboard-edit-canvas"]',
        title: 'Grid helpers',
        body: 'Zoom out to see the full picture, and switch on a grid, dots or column guides to line your tiles up.',
        position: 'top',
    },
    {
        target: '[data-tour="dashboard-edit-filters"]',
        title: 'Focus on your tiles',
        body: 'Make space by hiding filters while you edit. This only changes edit mode, viewers still see every filter.',
        position: 'top',
    },
];
