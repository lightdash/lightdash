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
