import { type DashboardFilters } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type LauncherCurrentDashboard } from './aiAgentLauncherSlice';
import {
    getCurrentDashboardPromptContext,
    getNonDefaultDashboardRuntimeOverrides,
} from './dashboardPageContext';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const filtered: DashboardFilters = {
    dimensions: [
        {
            id: 'country-filter',
            label: 'Country',
            operator: 'equals',
            target: { fieldId: 'orders.country', tableName: 'orders' },
            values: ['US'],
            lockedTabUuids: ['tab-1'],
            requiredGroupId: 'group-1',
            tileTargets: {
                'tile-1': {
                    fieldId: 'orders.country',
                    tableName: 'orders',
                },
            },
        },
    ],
    metrics: [],
    tableCalculations: [],
} as DashboardFilters;

const currentDashboard = (
    runtimeOverrides: LauncherCurrentDashboard['runtimeOverrides'],
): LauncherCurrentDashboard => ({
    projectUuid: 'project-1',
    uuid: 'dashboard-1',
    name: 'Orders',
    activeTabUuid: null,
    runtimeOverrides,
});

describe('dashboard page context', () => {
    it('omits default filters', () => {
        expect(
            getNonDefaultDashboardRuntimeOverrides({
                defaultFilters: emptyFilters,
                effectiveFilters: { ...emptyFilters },
            }),
        ).toBeNull();
    });

    it('captures non-default filters without opaque identifiers', () => {
        const overrides = getNonDefaultDashboardRuntimeOverrides({
            defaultFilters: emptyFilters,
            effectiveFilters: filtered,
        });
        expect(overrides?.dashboardFilters?.dimensions[0]).toEqual({
            label: 'Country',
            operator: 'equals',
            target: { fieldId: 'orders.country', tableName: 'orders' },
            values: ['US'],
        });
    });

    it('does not attach unchanged filters again', () => {
        const runtimeOverrides = { dashboardFilters: filtered };
        expect(
            getCurrentDashboardPromptContext({
                currentDashboard: currentDashboard(runtimeOverrides),
                previousDashboardContext: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-1',
                    runtimeOverrides,
                },
                projectUuid: 'project-1',
            }),
        ).toEqual([]);
    });

    it('attaches changed filters', () => {
        const runtimeOverrides = { dashboardFilters: filtered };
        expect(
            getCurrentDashboardPromptContext({
                currentDashboard: currentDashboard(runtimeOverrides),
                previousDashboardContext: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-1',
                },
                projectUuid: 'project-1',
            }),
        ).toEqual([
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                runtimeOverrides,
            },
        ]);
    });

    it('attaches one reset to defaults', () => {
        expect(
            getCurrentDashboardPromptContext({
                currentDashboard: currentDashboard(null),
                previousDashboardContext: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-1',
                    runtimeOverrides: { dashboardFilters: filtered },
                },
                projectUuid: 'project-1',
            }),
        ).toEqual([
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                runtimeOverrides: undefined,
            },
        ]);
    });

    it('does not attach defaults again after reset', () => {
        expect(
            getCurrentDashboardPromptContext({
                currentDashboard: currentDashboard(null),
                previousDashboardContext: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-1',
                },
                projectUuid: 'project-1',
            }),
        ).toEqual([]);
    });

    it('attaches a different dashboard', () => {
        expect(
            getCurrentDashboardPromptContext({
                currentDashboard: currentDashboard(null),
                previousDashboardContext: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-2',
                },
                projectUuid: 'project-1',
            }),
        ).toHaveLength(1);
    });
});
