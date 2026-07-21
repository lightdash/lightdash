import {
    assertUnreachable,
    type HomepageBlock,
    type HomepageConfig,
} from '@lightdash/common';
import { resolveHomepageLayout } from './resolveHomepageLayout';

// Typed per-block factory; `empty` builds the config-empty variant the
// visibility filter drops.
const makeBlock = (
    id: string,
    type: HomepageBlock['type'],
    empty = false,
): HomepageBlock => {
    switch (type) {
        case 'markdown':
            return { id, type, config: { content: empty ? '  ' : 'hello' } };
        case 'ask-ai-hero':
            return { id, type, config: { showGreeting: true } };
        case 'collection':
            return {
                id,
                type,
                config: {
                    title: 't',
                    items: empty ? [] : [{ contentType: 'chart', uuid: 'u' }],
                },
            };
        case 'resources':
            return {
                id,
                type,
                config: {
                    title: 't',
                    items: empty
                        ? []
                        : [{ title: 'r', url: 'https://x', kind: 'link' }],
                },
            };
        case 'announcements':
            return {
                id,
                type,
                config: {
                    title: 't',
                    items: empty ? [] : [{ text: 'x', date: 'd', author: 'a' }],
                },
            };
        case 'quick-actions':
            return {
                id,
                type,
                config: { actions: empty ? [] : [{ type: 'ask-ai' }] },
            };
        case 'metrics':
            return {
                id,
                type,
                config: {
                    title: 't',
                    items: empty
                        ? []
                        : [{ tableName: 't', metricName: 'm', label: 'l' }],
                },
            };
        case 'favorites':
        case 'recent':
            return { id, type, config: { title: 't' } };
        default:
            return assertUnreachable(type, 'Unknown homepage block type');
    }
};

const block = (id: string, type: HomepageBlock['type']): HomepageBlock =>
    makeBlock(id, type);

const emptyBlock = (id: string, type: HomepageBlock['type']): HomepageBlock =>
    makeBlock(id, type, true);

const collectionWithItems = (id: string, count: number): HomepageBlock => ({
    id,
    type: 'collection',
    config: {
        title: 't',
        items: Array.from({ length: count }, (_, i) => ({
            contentType: 'chart',
            uuid: `u${i}`,
        })),
    },
});

const makeConfig = (rows: HomepageBlock[][]): HomepageConfig => ({
    version: 1,
    rows: rows.map((blocks, i) => ({ id: `row-${i}`, blocks })),
});

describe('resolveHomepageLayout', () => {
    it('pulls a single leading ask-ai-hero into the hero slot', () => {
        const config = makeConfig([
            [block('a', 'ask-ai-hero')],
            [block('b', 'collection')],
        ]);
        const { hero, rows } = resolveHomepageLayout(config);
        expect(hero?.row.id).toBe('row-0');
        expect(rows.map((r) => r.id)).toEqual(['row-1']);
    });

    it('does not treat a multi-block first row as a hero', () => {
        const config = makeConfig([
            [block('a', 'ask-ai-hero'), block('b', 'resources')],
        ]);
        const { hero, rows } = resolveHomepageLayout(config);
        expect(hero).toBeNull();
        expect(rows).toHaveLength(1);
    });

    it('does not treat a non-hero single block as a leading hero', () => {
        const config = makeConfig([[block('a', 'markdown')]]);
        const { hero, rows } = resolveHomepageLayout(config);
        expect(hero).toBeNull();
        expect(rows[0].widthTier).toBe('reading');
    });

    it('gives single-block rows their block width tier', () => {
        const config = makeConfig([
            [block('a', 'markdown')],
            [block('b', 'collection')],
        ]);
        const { rows } = resolveHomepageLayout(config);
        expect(rows[0].widthTier).toBe('reading');
        expect(rows[1].widthTier).toBe('full');
    });

    it('makes multi-column rows full width with weighted columns', () => {
        const config = makeConfig([
            [block('m', 'metrics'), block('q', 'quick-actions')],
        ]);
        const { rows } = resolveHomepageLayout(config);
        expect(rows[0].widthTier).toBe('full');
        expect(rows[0].columns.map((c) => c.weight)).toEqual([2, 1]);
    });

    it('derives the gap from the incoming block rhythm; first row has none', () => {
        const config = makeConfig([
            [block('m', 'metrics')], // section, but first -> none
            [block('t', 'markdown')], // grouped -> tucks under it
            [block('c', 'collection')], // section -> new section
        ]);
        const { rows } = resolveHomepageLayout(config);
        expect(rows.map((r) => r.gap)).toEqual(['none', 'grouped', 'section']);
    });

    it('starts gap counting from the first body row when a hero leads', () => {
        const config = makeConfig([
            [block('a', 'ask-ai-hero')],
            [block('r', 'resources')], // grouped, but first body row -> none
            [block('c', 'collection')], // section
        ]);
        const { rows } = resolveHomepageLayout(config);
        expect(rows.map((r) => r.gap)).toEqual(['none', 'section']);
    });

    describe('config-empty blocks are invisible to the layout', () => {
        it('an empty leading block does not demote the hero', () => {
            const config = makeConfig([
                [emptyBlock('ann', 'announcements')],
                [block('a', 'ask-ai-hero')],
                [block('c', 'collection')],
            ]);
            const { hero, rows } = resolveHomepageLayout(config);
            expect(hero?.row.columns[0].block.type).toBe('ask-ai-hero');
            expect(hero?.presentation).toBe('shared');
            expect(rows.map((r) => r.id)).toEqual(['row-2']);
        });

        it('drops empty blocks from multi-column rows and empty rows entirely', () => {
            const config = makeConfig([
                [emptyBlock('r', 'resources'), block('f', 'favorites')],
                [emptyBlock('m', 'metrics')],
                [block('c', 'collection')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows).toHaveLength(2);
            expect(rows[0].columns.map((c) => c.block.id)).toEqual(['f']);
            expect(rows[1].id).toBe('row-2');
        });

        it('a blank leading markdown does not claim the intro role', () => {
            const config = makeConfig([
                [emptyBlock('blank', 'markdown')],
                [block('t', 'markdown')],
                [block('c', 'collection')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].columns[0].block.id).toBe('t');
            expect(rows[0].role).toBe('intro');
        });
    });

    describe('collection column weight scales with item count', () => {
        it('a sparse collection (<3 items) matches its sibling 1:1 instead of hogging 2x width', () => {
            const config = makeConfig([
                [collectionWithItems('c', 1), block('f', 'favorites')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].columns.map((c) => c.weight)).toEqual([1, 1]);
        });

        it('a collection with 2 items still matches its sibling 1:1', () => {
            const config = makeConfig([
                [collectionWithItems('c', 2), block('f', 'favorites')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].columns.map((c) => c.weight)).toEqual([1, 1]);
        });

        it('a collection with 3+ items keeps the wider 2x column', () => {
            const config = makeConfig([
                [collectionWithItems('c', 3), block('f', 'favorites')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].columns.map((c) => c.weight)).toEqual([2, 1]);
        });
    });

    describe('hero companions', () => {
        it('quick-actions above the composer join the hero instead of demoting it', () => {
            const config = makeConfig([
                [block('q', 'quick-actions')],
                [block('a', 'ask-ai-hero')],
                [block('c', 'collection')],
            ]);
            const { hero, rows } = resolveHomepageLayout(config);
            expect(hero?.row.columns[0].block.type).toBe('ask-ai-hero');
            expect(hero?.companions.map((r) => r.id)).toEqual(['row-0']);
            expect(hero?.presentation).toBe('shared');
            expect(rows.map((r) => r.id)).toEqual(['row-2']);
        });

        it('chrome rows without a composer after them stay ordinary body rows', () => {
            const config = makeConfig([
                [block('q', 'quick-actions')],
                [block('c', 'collection')],
            ]);
            const { hero, rows } = resolveHomepageLayout(config);
            expect(hero).toBeNull();
            expect(rows.map((r) => r.id)).toEqual(['row-0', 'row-1']);
        });
    });

    describe('fold-aware hero', () => {
        it('keeps the full viewport when the hero is the only content', () => {
            const config = makeConfig([[block('a', 'ask-ai-hero')]]);
            const { hero, rows } = resolveHomepageLayout(config);
            expect(hero?.presentation).toBe('viewport');
            expect(rows).toHaveLength(0);
        });

        it('yields to a shared viewport when body rows follow', () => {
            const config = makeConfig([
                [block('a', 'ask-ai-hero')],
                [block('b', 'collection')],
            ]);
            const { hero } = resolveHomepageLayout(config);
            expect(hero?.presentation).toBe('shared');
        });
    });

    describe('leading-text intro', () => {
        it('marks a lone leading markdown as intro and breaks the next row into a section', () => {
            const config = makeConfig([
                [block('t', 'markdown')],
                [block('t2', 'markdown')], // grouped, but forced to section
                [block('c', 'collection')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows.map((r) => r.role)).toEqual(['intro', 'body', 'body']);
            expect(rows.map((r) => r.gap)).toEqual([
                'none',
                'section',
                'section',
            ]);
        });

        it('does not mark an intro when a hero leads the page', () => {
            const config = makeConfig([
                [block('a', 'ask-ai-hero')],
                [block('t', 'markdown')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].role).toBe('body');
        });

        it('does not mark a markdown inside a multi-column first row as intro', () => {
            const config = makeConfig([
                [block('t', 'markdown'), block('r', 'resources')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].role).toBe('body');
        });

        it('does not mark a mid-page markdown as intro', () => {
            const config = makeConfig([
                [block('c', 'collection')],
                [block('t', 'markdown')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows.map((r) => r.role)).toEqual(['body', 'body']);
        });
    });

    describe('build surface', () => {
        it('keeps config-empty blocks and rows 1:1 with the config', () => {
            const config = makeConfig([
                [emptyBlock('ann', 'announcements')],
                [emptyBlock('r', 'resources'), block('f', 'favorites')],
                [block('c', 'collection')],
            ]);
            const { rows } = resolveHomepageLayout(config, {
                surface: 'build',
            });
            expect(rows.map((r) => r.id)).toEqual(['row-0', 'row-1', 'row-2']);
            expect(rows[1].columns.map((c) => c.block.id)).toEqual(['r', 'f']);
        });

        it('never hoists a hero — the ask-ai row stays in flow at composer width', () => {
            const config = makeConfig([
                [block('a', 'ask-ai-hero')],
                [block('c', 'collection')],
            ]);
            const { hero, rows } = resolveHomepageLayout(config, {
                surface: 'build',
            });
            expect(hero).toBeNull();
            expect(rows.map((r) => r.id)).toEqual(['row-0', 'row-1']);
            expect(rows[0].widthTier).toBe('composer');
        });

        it('applies the same fit and width math as view for visible content', () => {
            const config = makeConfig([
                [block('m', 'metrics'), block('f', 'favorites')],
                [block('c', 'collection')],
            ]);
            const view = resolveHomepageLayout(config);
            const build = resolveHomepageLayout(config, {
                surface: 'build',
            });
            expect(build.rows.map((r) => r.fit)).toEqual(
                view.rows.map((r) => r.fit),
            );
            expect(build.rows.map((r) => r.widthTier)).toEqual(
                view.rows.map((r) => r.widthTier),
            );
            expect(build.rows[0].columns.map((c) => c.hugUnits)).toEqual(
                view.rows[0].columns.map((c) => c.hugUnits),
            );
        });
    });

    describe('hug fit', () => {
        it('multi-column rows hug', () => {
            const config = makeConfig([
                [block('m', 'metrics'), block('f', 'favorites')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].fit).toBe('hug');
        });

        it('single-block rows fill their tier', () => {
            const config = makeConfig([[block('m', 'metrics')]]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].fit).toBe('fill');
        });

        it('a multi-column row reduced to one visible block fills', () => {
            const config = makeConfig([
                [emptyBlock('r', 'resources'), block('f', 'favorites')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows[0].fit).toBe('fill');
        });
    });

    describe('width smoothing (two axes)', () => {
        it('promotes content rows to full when any full row exists', () => {
            const config = makeConfig([
                [block('c', 'collection')], // full
                [block('r', 'resources')], // content -> promoted
                [block('f', 'favorites')], // content -> promoted
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows.map((r) => r.widthTier)).toEqual([
                'full',
                'full',
                'full',
            ]);
        });

        it('keeps content rows at content width when no full row exists', () => {
            const config = makeConfig([
                [block('r', 'resources')],
                [block('f', 'favorites')],
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows.map((r) => r.widthTier)).toEqual([
                'content',
                'content',
            ]);
        });

        it('never widens focal rows (reading / composer)', () => {
            const config = makeConfig([
                [block('t', 'markdown')], // reading
                [block('c', 'collection')], // full
                [block('a', 'ask-ai-hero')], // composer (mid-page)
            ]);
            const { rows } = resolveHomepageLayout(config);
            expect(rows.map((r) => r.widthTier)).toEqual([
                'reading',
                'full',
                'composer',
            ]);
        });

        it('renders the text/collection/ask-ai/favourites permutation on two axes', () => {
            const config = makeConfig([
                [block('t', 'markdown')],
                [block('c', 'collection')],
                [block('a', 'ask-ai-hero')],
                [block('f', 'favorites')],
            ]);
            const { hero, rows } = resolveHomepageLayout(config);
            expect(hero).toBeNull();
            expect(rows.map((r) => r.widthTier)).toEqual([
                'reading',
                'full',
                'composer',
                'full', // was content — joins the wide axis
            ]);
            expect(rows.map((r) => r.role)).toEqual([
                'intro',
                'body',
                'body',
                'body',
            ]);
        });
    });
});

describe('page grid — item spans', () => {
    it("gives a full-width row the block type's full span", () => {
        const { rows } = resolveHomepageLayout(
            makeConfig([[collectionWithItems('c', 6)]]),
        );
        expect(rows[0].widthTier).toBe('full');
        expect(rows[0].columns[0].itemSpan).toBe(4);
    });

    it('uses the content span when the row stays at content width', () => {
        // resources alone, no full row on the page, so no width smoothing
        const { rows } = resolveHomepageLayout(
            makeConfig([[block('r', 'resources')]]),
        );
        expect(rows[0].widthTier).toBe('content');
        expect(rows[0].columns[0].itemSpan).toBe(4);
    });

    it("follows the smoothed tier, not the block's declared tier", () => {
        // metrics forces the page wide, so the resources row is promoted
        // content -> full and must take its *full* span with it
        const { rows } = resolveHomepageLayout(
            makeConfig([[block('m', 'metrics')], [block('r', 'resources')]]),
        );
        expect(rows[1].widthTier).toBe('full');
        expect(rows[1].columns[0].itemSpan).toBe(4);
    });

    it('narrows the span when a block shares a row', () => {
        const { rows } = resolveHomepageLayout(
            makeConfig([[block('m', 'metrics'), block('r', 'resources')]]),
        );
        const [metrics, resources] = rows[0].columns;
        expect(metrics.itemSpan).toBe(6);
        // content cards land at the same ~281px width as metrics tiles
        expect(resources.itemSpan).toBe(6);
    });

    it('gives list and prose blocks no span', () => {
        const { rows } = resolveHomepageLayout(
            makeConfig([[block('f', 'favorites')], [block('t', 'markdown')]]),
        );
        expect(rows[0].columns[0].itemSpan).toBeNull();
        expect(rows[1].columns[0].itemSpan).toBeNull();
    });

    it('keeps metrics denser than content cards at the same width', () => {
        const { rows } = resolveHomepageLayout(
            makeConfig([
                [block('m', 'metrics')],
                [collectionWithItems('c', 6)],
            ]),
        );
        // 3 columns per tile => 4-up; 4 columns per card => 3-up
        expect(rows[0].columns[0].itemSpan).toBe(3);
        expect(rows[1].columns[0].itemSpan).toBe(4);
    });
});
