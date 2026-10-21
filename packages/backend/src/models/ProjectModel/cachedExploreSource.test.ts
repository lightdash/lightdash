import { cachedExploreNamesForSources } from './cachedExploreSource';

const current = ['primary', 'marketing', 'finance'];
const packages = [
    { sourceUuid: 'primary', packageName: 'core' },
    { sourceUuid: 'marketing', packageName: 'campaigns_project' },
    { sourceUuid: 'finance', packageName: 'ledger' },
];

const row = (sourceUuid: string | null, packageName = 'campaigns_project') => ({
    name: 'campaigns',
    sourceUuid,
    packageName,
});

describe('cachedExploreNamesForSources', () => {
    test.each([null, 'cli-local-source'])(
        'recovers a CLI row with source stamp %s from its persisted package',
        (stamp) => {
            expect(
                cachedExploreNamesForSources([row(stamp)], packages, current, [
                    'marketing',
                ]),
            ).toEqual(['campaigns']);
        },
    );

    test('keeps a current source stamp authoritative over package inference', () => {
        expect(
            cachedExploreNamesForSources([row('finance')], packages, current, [
                'marketing',
            ]),
        ).toEqual([]);
        expect(
            cachedExploreNamesForSources([row('finance')], packages, current, [
                'finance',
            ]),
        ).toEqual(['campaigns']);
    });

    test('does not guess when two current sources provide the same package', () => {
        expect(
            cachedExploreNamesForSources(
                [row(null)],
                [
                    ...packages,
                    { sourceUuid: 'finance', packageName: 'campaigns_project' },
                ],
                current,
                ['marketing'],
            ),
        ).toEqual([]);
    });

    test('ignores a removed source and duplicate catalogs for the same current source', () => {
        expect(
            cachedExploreNamesForSources(
                [row(null)],
                [
                    ...packages,
                    packages[1],
                    { sourceUuid: 'removed', packageName: 'campaigns_project' },
                ],
                current,
                ['marketing'],
            ),
        ).toEqual(['campaigns']);
    });

    test('does not use another package or a bare explore name as ownership', () => {
        expect(
            cachedExploreNamesForSources(
                [
                    row(null, 'ledger'),
                    row(null, 'unknown'),
                    { ...row(null), packageName: null },
                ],
                packages,
                current,
                ['marketing'],
            ),
        ).toEqual([]);
    });

    test('keeps stamped errors even without package metadata', () => {
        expect(
            cachedExploreNamesForSources(
                [{ ...row('marketing'), packageName: null }],
                [],
                current,
                ['marketing'],
            ),
        ).toEqual(['campaigns']);
    });
});
