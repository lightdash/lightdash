import { DateGranularity, type DashboardTab } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getActiveDashboardTab,
    getDashboardTabPath,
    getDateZoomGranularityFromSearch,
    getEmbedDashboardTabPath,
    getMinimalDashboardTabPath,
    sortDashboardTabs,
} from './dashboardPageUtils';

const tabs: DashboardTab[] = [
    {
        uuid: 'hidden-first',
        name: 'Hidden first',
        order: 0,
        hidden: true,
    },
    {
        uuid: 'visible-second',
        name: 'Visible second',
        order: 1,
        hidden: false,
    },
];

describe('dashboardPageUtils', () => {
    it('sorts tabs without mutating input', () => {
        const unsorted = [tabs[1], tabs[0]];

        expect(sortDashboardTabs(unsorted).map((tab) => tab.uuid)).toEqual([
            'hidden-first',
            'visible-second',
        ]);
        expect(unsorted.map((tab) => tab.uuid)).toEqual([
            'visible-second',
            'hidden-first',
        ]);
    });

    it('skips hidden tabs in view mode', () => {
        expect(
            getActiveDashboardTab({
                tabs,
                tabUuid: 'hidden-first',
                isEditMode: false,
            })?.uuid,
        ).toBe('visible-second');
    });

    it('allows hidden tabs in edit mode', () => {
        expect(
            getActiveDashboardTab({
                tabs,
                tabUuid: 'hidden-first',
                isEditMode: true,
            })?.uuid,
        ).toBe('hidden-first');
    });

    it('parses date zoom from search', () => {
        expect(getDateZoomGranularityFromSearch('?dateZoom=month')).toBe(
            DateGranularity.MONTH,
        );
        expect(getDateZoomGranularityFromSearch('?dateZoom=custom_week')).toBe(
            'custom_week',
        );
    });

    it('builds dashboard paths for each backend', () => {
        expect(
            getDashboardTabPath({
                projectUuid: 'project',
                dashboardUuid: 'dashboard',
                mode: 'view',
                tabUuid: 'tab',
            }),
        ).toBe('/projects/project/dashboards/dashboard/view/tabs/tab');
        expect(
            getMinimalDashboardTabPath({
                projectUuid: 'project',
                dashboardUuid: 'dashboard',
                tabUuid: 'tab',
            }),
        ).toBe('/minimal/projects/project/dashboards/dashboard/view/tabs/tab');
        expect(
            getEmbedDashboardTabPath({
                projectUuid: 'project',
                tabUuid: 'tab',
            }),
        ).toBe('/embed/project/tabs/tab');
    });
});
