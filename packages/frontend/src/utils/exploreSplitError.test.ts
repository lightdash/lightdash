import { getCandidateExploreNames } from './exploreSplitError';

describe('getCandidateExploreNames', () => {
    test('keeps only serialized string candidates', () => {
        expect(
            getCandidateExploreNames({
                candidateExploreNames: [
                    'sourceA__orders',
                    null,
                    'sourceB__orders',
                    42,
                ],
            }),
        ).toEqual(['sourceA__orders', 'sourceB__orders']);
    });

    test('returns no candidates for an invalid serialized value', () => {
        expect(
            getCandidateExploreNames({ candidateExploreNames: 'orders' }),
        ).toEqual([]);
    });
});
