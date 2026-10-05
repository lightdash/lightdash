import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import {
    getAllowedParameterValue,
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
