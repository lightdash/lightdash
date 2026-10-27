import { cachedExploreSourcesForSources } from './cachedExploreSource';

const current = ['primary', 'marketing', 'finance'];
const row = (
    name: string,
    sourceUuid: string | null,
    packageName: string | null = 'campaigns_project',
) => ({ name, sourceUuid, packageName });

describe('cached explore source ownership', () => {
    test.each([null, 'cli-local-source'])(
        'recovers a row with source stamp %s from another cached base table',
        (stamp) => {
            expect([
                ...cachedExploreSourcesForSources(
                    [
                        row('campaigns', stamp),
                        row('campaign_history', 'marketing'),
                    ],
                    current,
                    ['marketing'],
                ).keys(),
            ]).toEqual(['campaigns', 'campaign_history']);
        },
    );

    test('keeps a current stamp authoritative over package inference', () => {
        expect(
            cachedExploreSourcesForSources(
                [
                    row('campaigns', 'finance'),
                    row('campaign_history', 'marketing'),
                ],
                current,
                ['marketing', 'finance'],
            ),
        ).toEqual(
            new Map([
                ['campaigns', 'finance'],
                ['campaign_history', 'marketing'],
            ]),
        );
    });

    test('does not guess when two current sources provide the same package', () => {
        expect([
            ...cachedExploreSourcesForSources(
                [
                    row('campaigns', null),
                    row('history', 'marketing'),
                    row('ledger', 'finance'),
                ],
                current,
                ['marketing'],
            ).keys(),
        ]).toEqual(['history']);
    });

    test('ignores removed sources when inferring packages', () => {
        expect([
            ...cachedExploreSourcesForSources(
                [
                    row('campaigns', null),
                    row('history', 'marketing'),
                    row('old', 'removed'),
                ],
                current,
                ['marketing'],
            ).keys(),
        ]).toEqual(['campaigns', 'history', 'old']);
    });

    test('does not infer ownership without cached package evidence', () => {
        expect([
            ...cachedExploreSourcesForSources(
                [row('campaigns', null), row('ledger', 'finance', 'ledger')],
                current,
                ['marketing'],
            ).keys(),
        ]).toEqual([]);
    });

    test('keeps stamped errors without package metadata', () => {
        expect([
            ...cachedExploreSourcesForSources(
                [row('campaigns', 'marketing', null)],
                current,
                ['marketing'],
            ).keys(),
        ]).toEqual(['campaigns']);
    });
});
