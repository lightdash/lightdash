import {
    hashContentAsCodeDocument,
    isContentAsCodeContentHash,
    stableStringifyContentAsCode,
    toCanonicalContentAsCodeSnapshot,
} from './contentAsCodeHash';

describe('contentAsCodeHash', () => {
    it('stringifies objects with sorted keys', () => {
        expect(stableStringifyContentAsCode({ b: 1, a: 2 })).toBe(
            '{"a":2,"b":1}',
        );
    });

    it('strips downloadedAt and updatedAt the same way CLI download does', () => {
        const uploaded = {
            slug: 'orders',
            name: 'Orders',
            spaceSlug: 'jaffle-shop',
        };
        const downloaded = {
            ...uploaded,
            downloadedAt: new Date('2026-08-25T00:00:00.000Z'),
            updatedAt: new Date('2026-08-24T00:00:00.000Z'),
        };

        expect(toCanonicalContentAsCodeSnapshot(downloaded)).toEqual(uploaded);
        expect(hashContentAsCodeDocument(uploaded)).toBe(
            hashContentAsCodeDocument(downloaded),
        );
    });

    it('changes the hash when portable content changes', () => {
        expect(
            hashContentAsCodeDocument({ slug: 'orders', name: 'Orders' }),
        ).not.toBe(
            hashContentAsCodeDocument({ slug: 'orders', name: 'Orders v2' }),
        );
    });

    it('accepts sha256 hex hashes and rejects other strings', () => {
        const hash = hashContentAsCodeDocument({ slug: 'orders' });
        expect(isContentAsCodeContentHash(hash)).toBe(true);
        expect(isContentAsCodeContentHash('not-a-hash')).toBe(false);
        expect(isContentAsCodeContentHash(hash.toUpperCase())).toBe(false);
    });
});
