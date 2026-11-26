import { describe, expect, it } from 'vitest';
import {
    getDashboardChartPlace,
    hasLeftDashboardChart,
    isDroppingDashboardChanges,
} from './dashboardChartPlace';

describe('getDashboardChartPlace', () => {
    it.each([
        ['/projects/p/saved/my-chart/edit', 'savedChart'],
        ['/projects/p/saved/my-chart', 'savedChart'],
        ['/projects/p/tables', 'newChart'],
        ['/projects/p/tables/orders', 'newChart'],
        ['/projects/p/dashboards/my-dashboard/view/tabs/t', 'dashboard'],
        ['/projects/p/saved', 'elsewhere'],
        ['/projects/p/dashboards', 'elsewhere'],
        ['/projects/p/home', 'elsewhere'],
    ])('%s is %s', (pathname, place) => {
        expect(getDashboardChartPlace(pathname)).toBe(place);
    });
});

describe('hasLeftDashboardChart', () => {
    it('keeps the task while the user stays on the chart', () => {
        expect(hasLeftDashboardChart('dashboard', 'savedChart')).toBe(false);
        expect(hasLeftDashboardChart('savedChart', 'savedChart')).toBe(false);
        expect(hasLeftDashboardChart('dashboard', 'newChart')).toBe(false);
    });

    it('keeps the task on the way back to the dashboard', () => {
        expect(hasLeftDashboardChart('savedChart', 'dashboard')).toBe(false);
    });

    it('ends the task when the user goes anywhere else', () => {
        expect(hasLeftDashboardChart('savedChart', 'elsewhere')).toBe(true);
        expect(hasLeftDashboardChart('newChart', 'elsewhere')).toBe(true);
    });

    it('ends the task when the user starts a different kind of chart', () => {
        expect(hasLeftDashboardChart('savedChart', 'newChart')).toBe(true);
        expect(hasLeftDashboardChart('newChart', 'savedChart')).toBe(true);
    });
});

describe('isDroppingDashboardChanges', () => {
    const editingChart = {
        currentPathname: '/projects/p/saved/my-chart/edit',
        isEditingDashboardChart: true,
        hasDashboardChanges: true,
        isNextTheSameSavedChart: false,
    };

    it('asks before leaving for an unrelated page', () => {
        expect(
            isDroppingDashboardChanges({
                ...editingChart,
                nextPathname: '/projects/other/home',
            }),
        ).toBe(true);
    });

    it('asks before jumping to another saved chart', () => {
        expect(
            isDroppingDashboardChanges({
                ...editingChart,
                nextPathname: '/projects/p/saved/another-chart',
            }),
        ).toBe(true);
    });

    it('lets the user move between views of the same chart', () => {
        expect(
            isDroppingDashboardChanges({
                ...editingChart,
                nextPathname: '/projects/p/saved/my-chart/view',
                isNextTheSameSavedChart: true,
            }),
        ).toBe(false);
    });

    it('lets the user return to the dashboard', () => {
        expect(
            isDroppingDashboardChanges({
                ...editingChart,
                nextPathname: '/projects/p/dashboards/my-dashboard/edit',
            }),
        ).toBe(false);
    });

    it('does not ask when the dashboard has nothing unsaved', () => {
        expect(
            isDroppingDashboardChanges({
                ...editingChart,
                hasDashboardChanges: false,
                nextPathname: '/projects/p/home',
            }),
        ).toBe(false);
    });
});
