import { type ParameterDefinitions } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { formatParameterValue, getParameterSources } from './parameterSources';

const definitions: ParameterDefinitions = {
    region: { label: 'Region', default: 'EMEA' },
    plan: { label: 'Plan' },
};

describe('getParameterSources', () => {
    it('lists a parameter only for the tiles that reference it', () => {
        const result = getParameterSources({
            parameterValues: {},
            tileParameterReferences: { a: ['region'], b: ['plan'], c: [] },
            tileChartSavedParameters: {},
            parameterDefinitions: definitions,
        });
        expect(result.region.map((entry) => entry.tileUuid)).toEqual(['a']);
        expect(result.plan.map((entry) => entry.tileUuid)).toEqual(['b']);
    });

    it('uses the dashboard value when one is set', () => {
        const result = getParameterSources({
            parameterValues: { region: 'APAC' },
            tileParameterReferences: { a: ['region'], b: ['region'] },
            tileChartSavedParameters: { a: { region: 'LATAM' } },
            parameterDefinitions: definitions,
        });
        expect(result.region).toEqual([
            { tileUuid: 'a', value: 'APAC', source: 'dashboard' },
            { tileUuid: 'b', value: 'APAC', source: 'dashboard' },
        ]);
    });

    it('falls back to the definition default', () => {
        const result = getParameterSources({
            parameterValues: {},
            tileParameterReferences: { a: ['region'] },
            tileChartSavedParameters: { a: { region: 'LATAM' } },
            parameterDefinitions: definitions,
        });
        expect(result.region).toEqual([
            { tileUuid: 'a', value: 'EMEA', source: 'default' },
        ]);
    });

    it('uses the chart-saved value when there is no dashboard value and no default', () => {
        const result = getParameterSources({
            parameterValues: {},
            tileParameterReferences: { a: ['plan'], b: ['plan'] },
            tileChartSavedParameters: { a: { plan: 'pro' } },
            parameterDefinitions: definitions,
        });
        expect(result.plan).toEqual([
            { tileUuid: 'a', value: 'pro', source: 'chart' },
            { tileUuid: 'b', value: null, source: 'none' },
        ]);
    });
});

describe('formatParameterValue', () => {
    it('joins lists and renders null as empty', () => {
        expect(formatParameterValue(['a', 'b'])).toBe('a, b');
        expect(formatParameterValue(null)).toBe('');
        expect(formatParameterValue(3)).toBe('3');
    });
});
