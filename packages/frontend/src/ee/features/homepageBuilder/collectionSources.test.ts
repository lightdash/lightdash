import {
    collectionLimitOf,
    collectionSourceOf,
    DEFAULT_COLLECTION_LIMIT,
    isPersonalCollectionSource,
    MAX_COLLECTION_LIMIT,
    type HomepageBlock,
    type HomepageConfig,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resolveHomepageLayout } from './resolveHomepageLayout';

const collection = (
    config: Partial<HomepageBlock & { type: 'collection' }>['config'] = {
        title: 't',
        items: [],
    },
): HomepageBlock => ({ id: 'c1', type: 'collection', config });

const configWith = (blocks: HomepageBlock[]): HomepageConfig => ({
    version: 1,
    rows: [{ id: 'row-0', blocks }],
});

describe('collection source helpers', () => {
    it('treats a config with no source as hand-picked', () => {
        // Every collection stored before sources existed.
        expect(collectionSourceOf({ title: 't', items: [] })).toBe('manual');
    });

    it('defaults the limit and caps it', () => {
        expect(collectionLimitOf({ title: 't', items: [] })).toBe(
            DEFAULT_COLLECTION_LIMIT,
        );
        expect(collectionLimitOf({ title: 't', items: [], limit: 3 })).toBe(3);
        expect(collectionLimitOf({ title: 't', items: [], limit: 500 })).toBe(
            MAX_COLLECTION_LIMIT,
        );
    });

    it('knows which sources differ per viewer', () => {
        expect(isPersonalCollectionSource('favorites')).toBe(true);
        expect(isPersonalCollectionSource('recently-viewed')).toBe(true);
        expect(isPersonalCollectionSource('most-viewed')).toBe(false);
        expect(isPersonalCollectionSource('pinned')).toBe(false);
        expect(isPersonalCollectionSource('manual')).toBe(false);
    });
});

describe('layout resolution for dynamic collections', () => {
    it('drops a hand-picked collection with no items, as before', () => {
        const { rows } = resolveHomepageLayout(
            configWith([collection({ title: 't', items: [] })]),
        );
        expect(rows).toHaveLength(0);
    });

    it('keeps a dynamic collection with no config items — its content is a runtime fact', () => {
        const { rows } = resolveHomepageLayout(
            configWith([
                collection({ title: 't', items: [], source: 'most-viewed' }),
            ]),
        );
        expect(rows).toHaveLength(1);
    });

    it('sizes a dynamic collection by the limit it will fill up to', () => {
        // A 6-item limit reads as a wide block (weight 2), same as 6 hand-picked
        // items would; a 2-item limit stays narrow.
        const wide = resolveHomepageLayout(
            configWith([
                collection({ title: 't', items: [], source: 'pinned' }),
                {
                    id: 'q',
                    type: 'quick-actions',
                    config: { actions: [{ type: 'ask-ai' }] },
                },
            ]),
        );
        expect(wide.rows[0].columns[0].weight).toBe(2);

        const narrow = resolveHomepageLayout(
            configWith([
                collection({
                    title: 't',
                    items: [],
                    source: 'pinned',
                    limit: 2,
                }),
                {
                    id: 'q',
                    type: 'quick-actions',
                    config: { actions: [{ type: 'ask-ai' }] },
                },
            ]),
        );
        expect(narrow.rows[0].columns[0].weight).toBe(1);
    });

    it('still tolerates a config from another code version with no items field', () => {
        const foreign = configWith([
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            {
                id: 'c1',
                type: 'collection',
                config: { title: 't' },
            } as HomepageBlock,
        ]);
        expect(() => resolveHomepageLayout(foreign)).not.toThrow();
    });
});
