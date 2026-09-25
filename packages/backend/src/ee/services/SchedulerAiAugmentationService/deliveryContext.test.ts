import {
    FilterOperator,
    type DashboardDAO,
    type DashboardFilterRule,
    type SendNowScheduler,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getChartRuntimeOverrides,
    getDashboardRuntimeOverrides,
} from './deliveryContext';

const countryFilter = (values: string[]): DashboardFilterRule => ({
    id: 'country-filter',
    label: undefined,
    target: { fieldId: 'orders_country', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values,
});

const dashboard = {
    uuid: 'dashboard-uuid',
    filters: {
        dimensions: [countryFilter(['US', 'UK', 'FR'])],
        metrics: [],
        tableCalculations: [],
    },
    parameters: {
        region: { parameterName: 'region', value: 'EMEA' },
        currency: { parameterName: 'currency', value: 'USD' },
    },
    tabs: [
        { uuid: 'tab-overview', name: 'Overview', order: 0 },
        { uuid: 'tab-detail', name: 'Detail', order: 1 },
    ],
} as unknown as DashboardDAO;

const dashboardScheduler = (
    overrides: Partial<{
        filters: DashboardFilterRule[];
        parameters: Record<string, string>;
        selectedTabs: string[] | null;
    }>,
) =>
    ({
        savedChartUuid: null,
        dashboardUuid: dashboard.uuid,
        selectedTabs: null,
        ...overrides,
    }) as unknown as SendNowScheduler;

describe('getDashboardRuntimeOverrides', () => {
    it('pins the schedule filter values instead of the dashboard defaults', () => {
        const overrides = getDashboardRuntimeOverrides(
            dashboard,
            dashboardScheduler({ filters: [countryFilter(['US'])] }),
        );

        expect(overrides.dashboardFilters?.dimensions).toEqual([
            expect.objectContaining({
                target: { fieldId: 'orders_country', tableName: 'orders' },
                values: ['US'],
            }),
        ]);
    });

    it('pins the dashboard filters when the schedule has no overrides', () => {
        const overrides = getDashboardRuntimeOverrides(
            dashboard,
            dashboardScheduler({}),
        );

        expect(overrides.dashboardFilters?.dimensions).toEqual([
            expect.objectContaining({ values: ['US', 'UK', 'FR'] }),
        ]);
    });

    it('lets schedule parameters win over the dashboard parameters', () => {
        const overrides = getDashboardRuntimeOverrides(
            dashboard,
            dashboardScheduler({ parameters: { region: 'APAC' } }),
        );

        expect(overrides.dashboardParameters).toEqual({
            region: 'APAC',
            currency: 'USD',
        });
    });

    it('pins the tab when the schedule delivers a single tab', () => {
        const overrides = getDashboardRuntimeOverrides(
            dashboard,
            dashboardScheduler({ selectedTabs: ['tab-detail'] }),
        );

        expect(overrides.activeTab).toEqual({
            uuid: 'tab-detail',
            name: 'Detail',
        });
    });

    it('pins no tab when the schedule delivers several tabs', () => {
        const overrides = getDashboardRuntimeOverrides(
            dashboard,
            dashboardScheduler({
                selectedTabs: ['tab-overview', 'tab-detail'],
            }),
        );

        expect(overrides.activeTab).toBeUndefined();
    });
});

describe('getChartRuntimeOverrides', () => {
    it('pins the schedule parameters for a chart delivery', () => {
        const scheduler = {
            savedChartUuid: 'chart-uuid',
            dashboardUuid: null,
            parameters: { region: 'APAC' },
        } as unknown as SendNowScheduler;

        expect(getChartRuntimeOverrides(scheduler)).toEqual({
            dashboardParameters: { region: 'APAC' },
        });
    });

    it('pins nothing for a chart delivery without parameters', () => {
        const scheduler = {
            savedChartUuid: 'chart-uuid',
            dashboardUuid: null,
        } as unknown as SendNowScheduler;

        expect(getChartRuntimeOverrides(scheduler)).toBeNull();
    });
});
