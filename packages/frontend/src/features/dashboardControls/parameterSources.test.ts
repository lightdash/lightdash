import {
    type DashboardParameterControl,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    formatParameterValue,
    getTileParameterSource,
} from './parameterSources';

const parameterDefinitions: ParameterDefinitions = {
    region: { label: 'Region', default: 'EMEA' },
    plan: { label: 'Plan' },
};

const control = (
    tileTargets: DashboardParameterControl['tileTargets'] = {},
): DashboardParameterControl => ({
    id: 'control',
    label: 'Scope',
    parameterKeys: ['region', 'plan'],
    tileTargets,
});

const source = (
    key: string,
    overrides: {
        parameterValues?: ParametersValuesMap;
        parameterControls?: DashboardParameterControl[];
        tileChartSavedParameters?: Record<string, ParametersValuesMap>;
    } = {},
) =>
    getTileParameterSource({
        tileUuid: 'a',
        key,
        parameterValues: {},
        parameterControls: [],
        tileChartSavedParameters: {},
        parameterDefinitions,
        ...overrides,
    });

describe('getTileParameterSource', () => {
    it('uses the dashboard value when one is set', () => {
        expect(
            source('region', {
                parameterValues: { region: 'APAC' },
                tileChartSavedParameters: { a: { region: 'LATAM' } },
            }),
        ).toEqual({ value: 'APAC', source: 'dashboard' });
    });

    it('falls back to the definition default over the chart value', () => {
        expect(
            source('region', {
                tileChartSavedParameters: { a: { region: 'LATAM' } },
            }),
        ).toEqual({ value: 'EMEA', source: 'default' });
    });

    it('uses the chart value when there is no dashboard value and no default', () => {
        expect(
            source('plan', {
                tileChartSavedParameters: { a: { plan: 'pro' } },
            }),
        ).toEqual({ value: 'pro', source: 'chart' });
    });

    it('reports no value when nothing resolves', () => {
        expect(source('plan')).toEqual({ value: null, source: 'none' });
    });

    it('ignores the dashboard value on a tile the control leaves out', () => {
        const overrides = {
            parameterValues: { region: 'APAC', plan: 'team' },
            parameterControls: [control({ a: false })],
            tileChartSavedParameters: { a: { plan: 'pro' } },
        };
        expect(source('region', overrides)).toEqual({
            value: 'EMEA',
            source: 'default',
        });
        expect(source('plan', overrides)).toEqual({
            value: 'pro',
            source: 'chart',
        });
    });

    it('keeps the dashboard value only for the parameter a tile is narrowed to', () => {
        const overrides = {
            parameterValues: { region: 'APAC', plan: 'team' },
            parameterControls: [control({ a: 'plan' })],
        };
        expect(source('plan', overrides)).toEqual({
            value: 'team',
            source: 'dashboard',
        });
        expect(source('region', overrides)).toEqual({
            value: 'EMEA',
            source: 'default',
        });
    });

    it('leaves other tiles on the dashboard value', () => {
        expect(
            source('region', {
                parameterValues: { region: 'APAC' },
                parameterControls: [control({ b: false })],
            }),
        ).toEqual({ value: 'APAC', source: 'dashboard' });
    });
});

describe('formatParameterValue', () => {
    it('joins lists and renders null as empty', () => {
        expect(formatParameterValue(['a', 'b'])).toBe('a, b');
        expect(formatParameterValue(null)).toBe('');
        expect(formatParameterValue(3)).toBe('3');
    });
});
