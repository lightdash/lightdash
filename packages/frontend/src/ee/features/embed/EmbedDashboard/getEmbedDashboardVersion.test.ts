import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getEmbedDashboardVersion } from './getEmbedDashboardVersion';

const rule = (id: string, label: string | undefined): DashboardFilterRule => ({
    id,
    label,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
});

const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const baseArgs = {
    dashboard: {
        filters: filters([rule('saved', 'Status')]),
        config: { isDateZoomDisabled: false, pinnedParameters: ['region'] },
    },
    tiles: [],
    tabs: [],
    filters: filters([rule('saved', 'Status')]),
    temporaryFilters: filters([]),
    parameters: { region: { parameterName: 'region', value: 'EMEA' } },
    isAddFilterDisabled: true,
    filterLabelOverrides: undefined,
};

describe('getEmbedDashboardVersion', () => {
    it('includes the filters the viewer added', () => {
        const version = getEmbedDashboardVersion({
            ...baseArgs,
            temporaryFilters: filters([rule('added', undefined)]),
        });

        expect(version.filters?.dimensions.map(({ id }) => id)).toEqual([
            'saved',
            'added',
        ]);
    });

    it('restores labels that only show a translation', () => {
        const version = getEmbedDashboardVersion({
            ...baseArgs,
            filters: filters([rule('saved', 'Estado')]),
            filterLabelOverrides: { labels: { Status: 'Estado' } },
        });

        expect(version.filters?.dimensions[0].label).toBe('Status');
    });

    it('takes the current parameters and add filter flag over the saved config', () => {
        const version = getEmbedDashboardVersion(baseArgs);

        expect(version.parameters).toEqual(baseArgs.parameters);
        expect(version.config).toEqual({
            isDateZoomDisabled: false,
            isAddFilterDisabled: true,
            pinnedParameters: ['region'],
        });
    });

    it('keeps a saved disabled date zoom', () => {
        const version = getEmbedDashboardVersion({
            ...baseArgs,
            dashboard: {
                ...baseArgs.dashboard,
                config: { isDateZoomDisabled: true },
            },
        });

        expect(version.config?.isDateZoomDisabled).toBe(true);
    });
});
