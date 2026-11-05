import { type DashboardParameterControl } from '@lightdash/common';
import {
    getDashboardParameterOptionValues,
    getParameterControlInputs,
    getParameterControlOptionValues,
    getTileDashboardParameterInputs,
} from './parameterControls';

const country = (
    id: string,
    value: string,
    target: DashboardParameterControl['parameters'][string],
): DashboardParameterControl => ({
    id,
    label: null,
    value,
    valueType: { type: 'string', multiple: false },
    parameters: { country: target },
});
const city: DashboardParameterControl = {
    id: 'city',
    label: null,
    value: null,
    valueType: { type: 'string', multiple: false },
    parameters: { city: 'all' },
};
const controls = [
    country('default', 'UK', { except: ['comparison'] }),
    country('comparison', 'US', { only: ['comparison'] }),
    city,
];
const references = {
    primary: ['country', 'city'],
    comparison: ['country', 'city'],
};

describe('parameter option search context', () => {
    it('uses the current country control pick for cascading city options', () => {
        const inputs = getParameterControlInputs(controls, {}, [], {
            default: 'France',
            comparison: 'Germany',
        });
        const wide = getDashboardParameterOptionValues(inputs, {});
        expect(wide).toEqual({ country: 'France' });
        expect(
            getParameterControlOptionValues({
                controlInputs: inputs,
                dashboardValues: wide,
                tileUuids: ['primary', 'comparison'],
                key: 'city',
                tileParameterReferences: references,
            }),
        ).toEqual({ country: 'France' });
        expect(
            getParameterControlOptionValues({
                controlInputs: inputs,
                dashboardValues: wide,
                tileUuids: ['comparison'],
                key: 'city',
                tileParameterReferences: references,
            }),
        ).toEqual({ country: 'Germany' });
        expect(
            getTileDashboardParameterInputs({
                controlInputs: inputs,
                tileUuid: 'comparison',
                tileParameterReferences: references,
                dashboardValues: {},
            }).dashboardValues,
        ).toEqual({ country: 'Germany' });
    });
    it('keeps legacy values unchanged without active controls and honors outside overrides', () => {
        const legacy = { country: 'France' };
        expect(getDashboardParameterOptionValues(null, legacy)).toBe(legacy);
        expect(
            getParameterControlOptionValues({
                controlInputs: null,
                dashboardValues: legacy,
                tileUuids: ['primary'],
                key: 'city',
                tileParameterReferences: references,
            }),
        ).toBe(legacy);
        const inputs = getParameterControlInputs(
            controls,
            { country: 'Spain' },
            [],
            { default: 'France', comparison: 'Germany' },
        );
        const wide = getDashboardParameterOptionValues(inputs, {});
        expect(wide).toEqual({ country: 'Spain' });
        expect(
            getParameterControlOptionValues({
                controlInputs: inputs,
                dashboardValues: wide,
                tileUuids: ['comparison'],
                key: 'city',
                tileParameterReferences: references,
            }),
        ).toEqual({ country: 'Spain' });
    });
});
