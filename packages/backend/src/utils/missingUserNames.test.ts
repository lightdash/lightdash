import { getMissingUserNames } from './missingUserNames';

describe('getMissingUserNames', () => {
    test.each([
        [
            'fills both blank names',
            { firstName: '', lastName: '' },
            { firstName: 'Ana', lastName: 'Lee' },
            { firstName: 'Ana', lastName: 'Lee' },
        ],
        [
            'treats null and whitespace as blank and trims the provided name',
            { firstName: null, lastName: '   ' },
            { firstName: ' Ana ', lastName: 'Lee' },
            { firstName: 'Ana', lastName: 'Lee' },
        ],
        [
            'keeps a saved name and fills only the other',
            { firstName: 'Custom', lastName: '' },
            { firstName: 'Ana', lastName: 'Lee' },
            { lastName: 'Lee' },
        ],
        [
            'skips a provided name the profile would reject',
            { firstName: '', lastName: '' },
            { firstName: '<b>Ana', lastName: 'Lee' },
            { lastName: 'Lee' },
        ],
    ])('%s', (_name, saved, provided, expected) => {
        expect(getMissingUserNames(saved, provided)).toStrictEqual(expected);
    });

    test.each([
        [
            'both names are already set',
            { firstName: 'Custom', lastName: 'Name' },
            { firstName: 'Ana', lastName: 'Lee' },
        ],
        [
            'the provider sends no names',
            { firstName: '', lastName: '' },
            { firstName: undefined, lastName: undefined },
        ],
        [
            'the provider sends blank names',
            { firstName: '', lastName: '' },
            { firstName: ' ', lastName: '' },
        ],
    ])('returns nothing to fill when %s', (_name, saved, provided) => {
        expect(getMissingUserNames(saved, provided)).toBeUndefined();
    });
});
