import { describe, expect, it } from 'vitest';
import { shouldBlockSavedChartNavigation } from '.';

const dirtyChartNavigation = {
    currentPathname: '/projects/project-uuid/saved/chart-slug/edit',
    hasUnsavedChanges: true,
    isEditMode: true,
    isSaveModalOpen: false,
    isLeavingTrainingCopyRoute: false,
    projectUrlIdentifier: 'project-slug',
    savedChartSlug: 'chart-slug',
    savedChartUuid: 'chart-uuid',
    dashboardUuid: 'dashboard-uuid',
    dashboardIdentifier: 'dashboard-slug',
};

describe('SavedChartsHeader navigation blocker', () => {
    it('allows a search-only cleanup on the current UUID chart path', () => {
        expect(
            shouldBlockSavedChartNavigation({
                ...dirtyChartNavigation,
                nextPathname: dirtyChartNavigation.currentPathname,
            }),
        ).toBe(false);
    });

    it('still blocks leaving the dirty chart for another route', () => {
        expect(
            shouldBlockSavedChartNavigation({
                ...dirtyChartNavigation,
                nextPathname: '/projects/project-slug/saved/another-chart/edit',
            }),
        ).toBe(true);
    });
});
