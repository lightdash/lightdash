import { describe, expect, it } from 'vitest';
import {
    getDashboardParameterOverrides,
    parseDashboardParametersUrl,
    reconcileDashboardParameters,
    toDashboardParameters,
} from './dashboardParametersUrl';

describe('dashboard parameter URL helpers', () => {
    it('parses supported parameter values', () => {
        expect(
            parseDashboardParametersUrl(
                JSON.stringify({
                    metric: 'revenue',
                    limit: 10,
                    regions: ['EU', 'US'],
                    limits: [10, 20],
                }),
            ),
        ).toEqual({
            metric: 'revenue',
            limit: 10,
            regions: ['EU', 'US'],
            limits: [10, 20],
        });
    });

    it.each([
        'null',
        '[]',
        '{"metric":true}',
        '{"metric":{"value":"revenue"}}',
        '{"metric":["revenue",10]}',
        '{"metric":1e309}',
    ])('rejects an invalid parameters value: %s', (value) => {
        expect(() => parseDashboardParametersUrl(value)).toThrow();
    });

    it('converts URL values to dashboard parameter state', () => {
        expect(toDashboardParameters({ metric: 'revenue' })).toEqual({
            metric: { parameterName: 'metric', value: 'revenue' },
        });
    });

    it('only serializes values that differ from saved defaults', () => {
        expect(
            getDashboardParameterOverrides(
                { metric: 'revenue', region: 'EU' },
                {
                    metric: { parameterName: 'metric', value: 'revenue' },
                    region: { parameterName: 'region', value: 'US' },
                },
            ),
        ).toEqual({ region: 'EU' });
    });

    it('preserves runtime overrides in view mode', () => {
        expect(
            reconcileDashboardParameters(
                {
                    metric: { parameterName: 'metric', value: 'profit' },
                },
                {
                    metric: { parameterName: 'metric', value: 'revenue' },
                    region: { parameterName: 'region', value: 'EU' },
                },
                false,
            ),
        ).toEqual({
            metric: { parameterName: 'metric', value: 'profit' },
            region: { parameterName: 'region', value: 'EU' },
        });
    });

    it('drops runtime overrides in edit mode', () => {
        const savedParameters = {
            metric: { parameterName: 'metric', value: 'revenue' },
        };

        expect(
            reconcileDashboardParameters(
                {
                    metric: { parameterName: 'metric', value: 'profit' },
                },
                savedParameters,
                true,
            ),
        ).toEqual(savedParameters);
    });
});
