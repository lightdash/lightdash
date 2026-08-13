import { describe, expect, it } from 'vitest';
import {
    getDashboardParameterOverrides,
    parseDashboardParametersUrl,
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
                }),
            ),
        ).toEqual({ metric: 'revenue', limit: 10, regions: ['EU', 'US'] });
    });

    it.each([
        'null',
        '[]',
        '{"metric":true}',
        '{"metric":{"value":"revenue"}}',
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
});
