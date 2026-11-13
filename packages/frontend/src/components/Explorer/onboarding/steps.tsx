import { type FloatingPosition } from '@mantine/core';

export type ExplorerTourStep = {
    target: string;
    title: string;
    body: string;
    position: FloatingPosition;
};

// Targets reuse markers the controls already carry, so the tour adds none
export const EXPLORER_TOUR_STEPS: ExplorerTourStep[] = [
    {
        target: '[data-testid="virtualized-tree-scroll-container"]',
        title: 'Pick what to measure',
        body: 'Click a metric, then the dimensions you want to split it by. The icons show each field type.',
        position: 'right',
    },
    {
        target: '.mantine-Card-root:has([data-testid="Chart-card-expand"])',
        title: 'Or drag a field here',
        body: 'Drop a field on Chart or Results to add it and run the query. On Chart it also picks a chart type for you.',
        position: 'bottom',
    },
    {
        target: '[data-testid="RefreshButton/RunQueryButton"]',
        title: 'Run when you are ready',
        body: 'An orange dot means your fields changed since the last run. You can also have it re-run on every change.',
        position: 'bottom',
    },
];
