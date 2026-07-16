import { type DashboardFilters } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type LauncherCurrentDashboard } from './aiAgentLauncherSlice';
import {
    addActiveTabToDashboardRuntimeOverrides,
    getCurrentDashboardPromptContext,
    getDashboardParametersValuesMap,
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
    it('adds the active tab to the dashboard context snapshot', () => {
        expect(
            addActiveTabToDashboardRuntimeOverrides({
                activeTab: { uuid: 'tab-1', name: 'Overview' },
                runtimeOverrides: null,
            }),
        ).toEqual({
            activeTab: { uuid: 'tab-1', name: 'Overview' },
        });
    });

    it('leaves tabless dashboards without runtime context', () => {
        expect(
            addActiveTabToDashboardRuntimeOverrides({
                activeTab: undefined,
                runtimeOverrides: null,
            }),
        ).toBeNull();
    });

    it('omits default runtime values', () => {
        expect(
            getNonDefaultDashboardRuntimeOverrides({
                defaultFilters: emptyFilters,
                effectiveFilters: { ...emptyFilters },
                defaultParameters: { region: 'US' },
                effectiveParameters: { region: 'US' },
                defaultDateZoom: { granularity: 'Month' },
                effectiveDateZoom: { granularity: 'Month' },
            }),
        ).toBeNull();
    });

    it('captures non-default filters without opaque identifiers', () => {
        const overrides = getNonDefaultDashboardRuntimeOverrides({
            defaultFilters: emptyFilters,
            effectiveFilters: filtered,
            defaultParameters: {},
            effectiveParameters: {},
            defaultDateZoom: null,
            effectiveDateZoom: null,
        });
        expect(overrides?.dashboardFilters?.dimensions[0]).toEqual({
            label: 'Country',
            operator: 'equals',
            target: { fieldId: 'orders.country', tableName: 'orders' },
            values: ['US'],
        });
    });

    it('captures non-default parameter values and date zoom', () => {
        expect(
            getNonDefaultDashboardRuntimeOverrides({
                defaultFilters: emptyFilters,
                effectiveFilters: emptyFilters,
                defaultParameters: { region: 'US' },
                effectiveParameters: { region: 'EU', tiers: ['gold'] },
                defaultDateZoom: { granularity: 'Month' },
                effectiveDateZoom: { granularity: 'Week' },
            }),
        ).toEqual({
            dashboardParameters: { region: 'EU', tiers: ['gold'] },
            dateZoom: { granularity: 'Week' },
        });
    });

    it('captures selecting no date zoom when a saved default exists', () => {
        expect(
            getNonDefaultDashboardRuntimeOverrides({
                defaultFilters: emptyFilters,
                effectiveFilters: emptyFilters,
                defaultParameters: {},
                effectiveParameters: {},
                defaultDateZoom: { granularity: 'Month' },
                effectiveDateZoom: null,
            }),
        ).toEqual({ dateZoom: null });
    });

    it('converts saved dashboard parameters to effective values', () => {
        expect(
            getDashboardParametersValuesMap({
                region: { parameterName: 'region', value: 'US' },
                tiers: { parameterName: 'tiers', value: ['gold'] },
                empty: { parameterName: 'empty', value: '' },
            }),
        ).toEqual({ region: 'US', tiers: ['gold'] });
    });

    it('does not attach unchanged runtime values again', () => {
        const runtimeOverrides = {
            activeTab: { uuid: 'tab-1', name: 'Overview' },
            dashboardFilters: filtered,
            dashboardParameters: { region: 'EU' },
            dateZoom: { granularity: 'Week' },
        };
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

    it('attaches a changed active tab', () => {
        expect(
            getCurrentDashboardPromptContext({
                currentDashboard: currentDashboard({
                    activeTab: { uuid: 'tab-2', name: 'Customers' },
                }),
                previousDashboardContext: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-1',
                    runtimeOverrides: {
                        activeTab: { uuid: 'tab-1', name: 'Overview' },
                    },
                },
                projectUuid: 'project-1',
            }),
        ).toEqual([
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                runtimeOverrides: {
                    activeTab: { uuid: 'tab-2', name: 'Customers' },
                },
            },
        ]);
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
