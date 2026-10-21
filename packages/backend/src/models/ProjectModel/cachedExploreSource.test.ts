import { cachedExploreNamesForSources } from './cachedExploreSource';

const current = ['primary', 'marketing', 'finance'];
const catalog = (
    sourceUuid: string,
    packageName: string,
    nodePackageNames: string[] = [],
) => ({ sourceUuid, packageName, nodePackageNames });
const packages = [
    catalog('primary', 'core'),
    catalog('marketing', 'campaigns_project'),
    catalog('finance', 'ledger'),
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
                [...packages, catalog('finance', 'campaigns_project')],
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
                    catalog('removed', 'campaigns_project'),
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

    test.each([null, 'cli-local-source'])(
        'recovers installed-package models with source stamp %s from catalog node packages',
        (stamp) => {
            const catalogs = [
                catalog('marketing', 'campaigns_project', [
                    'campaigns_project',
                    'synthetic_vendor',
                    'synthetic_vendor',
                ]),
            ];
            expect(
                cachedExploreNamesForSources(
                    [
                        row(stamp),
                        {
                            ...row(stamp, 'synthetic_vendor'),
                            name: 'vendor_receipt',
                        },
                    ],
                    catalogs,
                    current,
                    ['marketing'],
                ),
            ).toEqual(['campaigns', 'vendor_receipt']);
        },
    );

    test('rejects an installed package provided by two current source catalogs', () => {
        const catalogs = [
            catalog('marketing', 'campaigns_project', ['synthetic_vendor']),
            catalog('finance', 'ledger', ['synthetic_vendor']),
        ];
        expect(
            cachedExploreNamesForSources(
                [row(null, 'synthetic_vendor')],
                catalogs,
                current,
                ['marketing', 'finance'],
            ),
        ).toEqual([]);
    });

    test('a root package and an installed package compete in the same ownership map', () => {
        const catalogs = [
            catalog('marketing', 'campaigns_project', ['ledger']),
            catalog('finance', 'ledger'),
        ];
        expect(
            cachedExploreNamesForSources(
                [row(null, 'ledger')],
                catalogs,
                current,
                ['finance'],
            ),
        ).toEqual([]);
    });

    test('keeps a current stamp authoritative over catalog node package ownership', () => {
        const catalogs = [
            catalog('marketing', 'campaigns_project', ['synthetic_vendor']),
        ];
        expect(
            cachedExploreNamesForSources(
                [row('finance', 'synthetic_vendor')],
                catalogs,
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
