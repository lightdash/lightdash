import { type Dashboard } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildLayoutSaveBody } from './layoutSaveBody';

const dashboard = (o: Partial<Dashboard>): Dashboard =>
    ({
        filters: { dimensions: [], metrics: [], tableCalculations: [] },
        tabs: [],
        ...o,
    }) as Dashboard;

describe('buildLayoutSaveBody', () => {
    it('leaves out config and parameters the dashboard does not have', () => {
        const body = buildLayoutSaveBody(
            dashboard({
                config: null as unknown as Dashboard['config'],
                parameters: undefined,
            }),
            [],
        );
        expect(Object.keys(body).sort()).toEqual(['filters', 'tabs', 'tiles']);
    });

    it('keeps config and parameters when present', () => {
        const config = { isDateZoomDisabled: true };
        const parameters = { region: { parameterName: 'region', value: 'EU' } };
        const body = buildLayoutSaveBody(
            dashboard({
                config,
                parameters: parameters as Dashboard['parameters'],
            }),
            [],
        );
        expect(body).toMatchObject({ config, parameters });
    });
});
