import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import {
    getAllowedParameterValue,
    isParameterCompatible,
    omitDisallowedParameterValues,
} from './parameterOptions';

const fixed: LightdashProjectParameter = {
    label: 'Time zoom',
    default: 'monthly',
    options: ['weekly', 'monthly', 'quarterly'],
};

describe('getAllowedParameterValue', () => {
    it('keeps a value listed in options', () => {
        expect(getAllowedParameterValue(fixed, 'weekly')).toBe('weekly');
    });

    it('rejects a value outside the options', () => {
        expect(getAllowedParameterValue(fixed, 'true')).toBeNull();
    });

    it('accepts the configured default even when it is not an option', () => {
        expect(
            getAllowedParameterValue({ ...fixed, default: 'all' }, 'all'),
        ).toBe('all');
    });

    it('matches labelled and numeric options regardless of value type', () => {
        const labelled: LightdashProjectParameter = {
            label: 'Limit',
            type: 'number',
            options: [
                { label: 'Ten', value: 10 },
                { label: 'Twenty', value: 20 },
            ],
        };
        expect(getAllowedParameterValue(labelled, 10)).toBe(10);
        expect(getAllowedParameterValue(labelled, '20')).toBe('20');
        expect(getAllowedParameterValue(labelled, 30)).toBeNull();
    });

    it('keeps only the allowed items of a multi-value', () => {
        const multiple = { ...fixed, multiple: true };
        expect(getAllowedParameterValue(multiple, ['weekly', 'true'])).toEqual([
            'weekly',
        ]);
        expect(getAllowedParameterValue(multiple, ['true'])).toBeNull();
    });

    it.each<[string, LightdashProjectParameter]>([
        ['custom values are allowed', { ...fixed, allow_custom_values: true }],
        [
            'options come from a dimension',
            {
                ...fixed,
                options_from_dimension: { model: 'plan', dimension: 'name' },
            },
        ],
        ['there are no options', { label: 'Free text' }],
        ['the parameter is a date', { ...fixed, type: 'date' }],
    ])('accepts any value when %s', (_, definition) => {
        expect(getAllowedParameterValue(definition, 'anything')).toBe(
            'anything',
        );
    });

    it('accepts any value for an unknown parameter', () => {
        expect(getAllowedParameterValue(undefined, 'anything')).toBe(
            'anything',
        );
    });
});

describe('omitDisallowedParameterValues', () => {
    it('drops disallowed values and keeps the rest', () => {
        expect(
            omitDisallowedParameterValues(
                { time_zoom: 'true', other: 'x', unknown: 'y' },
                { time_zoom: fixed, other: { label: 'Other' } },
            ),
        ).toEqual({ other: 'x', unknown: 'y' });
    });
});

describe('isParameterCompatible', () => {
    const regions: LightdashProjectParameter = {
        label: 'Region',
        options: ['EMEA', 'APAC'],
        default: 'EMEA',
    };

    it('takes the same options and default', () => {
        expect(
            isParameterCompatible(regions, {
                label: 'Payments region',
                options: ['APAC', 'EMEA'],
            }),
        ).toBe(true);
    });

    it('refuses other options', () => {
        expect(
            isParameterCompatible(regions, {
                label: 'Currency',
                options: ['EUR', 'USD'],
            }),
        ).toBe(false);
    });

    it('refuses a different multiple', () => {
        expect(
            isParameterCompatible(regions, { ...regions, multiple: true }),
        ).toBe(false);
    });

    it('refuses another type, even one that takes any value', () => {
        expect(
            isParameterCompatible(regions, { label: 'Start', type: 'date' }),
        ).toBe(false);
        expect(
            isParameterCompatible(regions, {
                label: 'Threshold',
                type: 'number',
                allow_custom_values: true,
            }),
        ).toBe(false);
        expect(
            isParameterCompatible(regions, {
                label: 'Region',
                type: 'string',
                options: ['EMEA', 'APAC'],
                default: 'EMEA',
            }),
        ).toBe(true);
    });

    it('lets one that takes custom values join a fixed-options control, not the reverse', () => {
        const custom: LightdashProjectParameter = {
            label: 'Region',
            options: ['EMEA'],
            allow_custom_values: true,
        };
        expect(isParameterCompatible(regions, custom)).toBe(true);
        expect(isParameterCompatible(custom, regions)).toBe(false);
    });
});
