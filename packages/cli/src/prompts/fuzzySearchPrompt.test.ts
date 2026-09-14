import { fuzzyFilterChoices } from './fuzzySearchPrompt';

const buildChoices = (names: string[]) =>
    names.map((name) => ({ name, value: name }));

describe('fuzzyFilterChoices', () => {
    it('returns every choice when the search is empty', () => {
        const choices = buildChoices(['alpha', 'beta']);
        expect(fuzzyFilterChoices(choices, '')).toEqual(choices);
        expect(fuzzyFilterChoices(choices, '   ')).toEqual(choices);
    });

    it('matches case-insensitively on substrings', () => {
        const choices = buildChoices(['Jaffle Shop', 'Internal analytics']);
        expect(
            fuzzyFilterChoices(choices, 'analytics').map((c) => c.name),
        ).toEqual(['Internal analytics']);
    });

    it('matches out-of-order tokens', () => {
        const choices = buildChoices([
            'production-eu',
            'production-us',
            'staging-eu',
        ]);
        expect(
            fuzzyFilterChoices(choices, 'eu prod').map((c) => c.name),
        ).toEqual(['production-eu']);
    });

    it('matches subsequences', () => {
        const choices = buildChoices(['production-europe', 'staging']);
        expect(fuzzyFilterChoices(choices, 'pdeu').map((c) => c.name)).toEqual([
            'production-europe',
        ]);
    });

    it('ranks prefix matches above substring and subsequence matches', () => {
        const choices = buildChoices([
            'my-prod-clone',
            'production',
            'p-r-o-d',
        ]);
        expect(fuzzyFilterChoices(choices, 'prod').map((c) => c.name)).toEqual([
            'production',
            'my-prod-clone',
            'p-r-o-d',
        ]);
    });

    it('keeps the original order between equally-ranked choices', () => {
        const choices = buildChoices(['prod-a', 'prod-b', 'prod-c']);
        expect(fuzzyFilterChoices(choices, 'prod').map((c) => c.name)).toEqual([
            'prod-a',
            'prod-b',
            'prod-c',
        ]);
    });

    it('returns nothing when a token does not match', () => {
        const choices = buildChoices(['alpha', 'beta']);
        expect(fuzzyFilterChoices(choices, 'zzz')).toEqual([]);
    });
});
