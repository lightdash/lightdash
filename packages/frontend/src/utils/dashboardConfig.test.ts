import {
    MetricType,
    type AdditionalMetric,
    type DashboardConfig,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildDashboardConfig } from './dashboardConfig';

const customMetric = (name: string): AdditionalMetric => ({
    name,
    label: name,
    table: 'orders',
    sql: '${TABLE}.amount',
    type: MetricType.SUM,
});

const baseArgs = {
    existingConfig: undefined as DashboardConfig | undefined,
    isDateZoomDisabled: false,
    isAddFilterDisabled: false,
    pinnedParameters: [],
    parameterOrder: [],
    hasParameterOrderChanged: false,
    dateZoomGranularities: [],
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: undefined,
    hasDefaultDateZoomGranularityChanged: false,
    dateZoomConfig: { controls: [], tileTargets: {} },
    hasDateZoomConfigChanged: false,
    requiredFiltersNote: undefined,
};

describe('buildDashboardConfig', () => {
    it('carries the persisted customMetrics registry through an unrelated save', () => {
        const registry = [customMetric('total_revenue')];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                customMetrics: registry,
            },
            // Unrelated change being saved
            isDateZoomDisabled: true,
        });

        expect(result.customMetrics).toEqual(registry);
        expect(result.isDateZoomDisabled).toBe(true);
    });

    it('staged customMetrics overwrite the persisted registry', () => {
        const staged = [customMetric('avg_basket')];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                customMetrics: [customMetric('total_revenue')],
            },
            stagedCustomMetrics: staged,
        });

        expect(result.customMetrics).toEqual(staged);
    });

    it('staged empty array clears the registry (deleting the last metric)', () => {
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                customMetrics: [customMetric('total_revenue')],
            },
            stagedCustomMetrics: [],
        });

        expect(result.customMetrics).toEqual([]);
    });

    it('carries unchanged parameterOrder and date zoom settings forward', () => {
        const existingConfig: DashboardConfig = {
            isDateZoomDisabled: false,
            parameterOrder: ['p1', 'p2'],
            dateZoomGranularities: ['month'],
            defaultDateZoomGranularity: 'month',
            dateZoomConfig: {
                controls: [{ uuid: 'c1', name: 'Grain', granularity: 'month' }],
                tileTargets: {},
            },
        };
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig,
        });

        expect(result.parameterOrder).toEqual(['p1', 'p2']);
        expect(result.dateZoomGranularities).toEqual(['month']);
        expect(result.defaultDateZoomGranularity).toEqual('month');
        expect(result.dateZoomConfig).toEqual(existingConfig.dateZoomConfig);
    });

    it('replaces changed values instead of carrying the old ones', () => {
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                parameterOrder: ['old'],
            },
            parameterOrder: ['new'],
            hasParameterOrderChanged: true,
        });

        expect(result.parameterOrder).toEqual(['new']);
    });

    it('produces a value for every DashboardConfig key', () => {
        // A key missing from the built object is deleted on save — this
        // pins the landmine the extraction exists to defuse.
        const result = buildDashboardConfig(baseArgs);
        const expectedKeys: Record<keyof DashboardConfig, true> = {
            isDateZoomDisabled: true,
            isAddFilterDisabled: true,
            pinnedParameters: true,
            parameterOrder: true,
            dateZoomGranularities: true,
            defaultDateZoomGranularity: true,
            dateZoomConfig: true,
            requiredFiltersNote: true,
            customMetrics: true,
        };
        expect(Object.keys(result).sort()).toEqual(
            Object.keys(expectedKeys).sort(),
        );
    });
});
