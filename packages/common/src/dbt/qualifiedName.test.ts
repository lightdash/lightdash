import { qualifyManifestNames } from './qualifiedName';

describe('versioned model qualification', () => {
    const versions = [1, 2].map((version) => ({
        uniqueId: `model.analytics.orders.v${version}`,
        name: 'orders',
        package_name: 'analytics',
        lightdash_source_name: 'analytics',
        version,
    }));
    const peer = {
        uniqueId: 'model.finance.orders',
        name: 'orders',
        package_name: 'finance',
        lightdash_source_name: 'finance',
    };

    it.each(['source', 'package'])(
        'allows distinct versions in the same %s namespace',
        (namespace) => {
            const items = [...versions, peer].map((item) => ({
                ...item,
                lightdash_source_name:
                    namespace === 'source'
                        ? item.lightdash_source_name
                        : undefined,
            }));

            expect([...qualifyManifestNames(items, 'model')]).toEqual([
                ['model.analytics.orders.v1', 'analytics__orders'],
                ['model.analytics.orders.v2', 'analytics__orders'],
                ['model.finance.orders', 'finance__orders'],
            ]);
        },
    );

    it.each([
        { package_name: 'another_package' },
        { name: 'analytics__orders' },
        { version: 1 },
        { version: '1' },
        { version: null },
        { version: undefined },
    ])('rejects a different model or a repeated version: %j', (override) => {
        expect(() =>
            qualifyManifestNames(
                [versions[0], { ...versions[1], ...override }, peer],
                'model',
            ),
        ).toThrow('ambiguous after qualification');
    });

    it('rejects a genuine collision even when the group also contains model versions', () => {
        expect(() =>
            qualifyManifestNames(
                [
                    ...versions,
                    peer,
                    {
                        uniqueId: 'model.warehouse.analytics__orders',
                        name: 'analytics__orders',
                        package_name: 'warehouse',
                        lightdash_source_name: 'warehouse',
                    },
                ],
                'model',
            ),
        ).toThrow('ambiguous after qualification');
    });

    it('keeps the metric collision guard', () => {
        expect(() =>
            qualifyManifestNames([...versions, peer], 'metric'),
        ).toThrow('ambiguous after qualification');
    });
});
