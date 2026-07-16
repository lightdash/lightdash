import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';
import { resolveHomepageLayout } from './resolveHomepageLayout';

const block = (id: string, type: HomepageBlock['type']): HomepageBlock =>
    ({ id, type, config: {} }) as HomepageBlock;

const makeConfig = (rows: HomepageBlock[][]): HomepageConfig => ({
    version: 1,
    rows: rows.map((blocks, i) => ({ id: `row-${i}`, blocks })),
});

describe('resolveHomepageLayout', () => {
    it('pulls a single leading ask-ai-hero into heroRow', () => {
        const config = makeConfig([
            [block('a', 'ask-ai-hero')],
            [block('b', 'collection')],
        ]);
        const { heroRow, rows } = resolveHomepageLayout(config);
        expect(heroRow?.id).toBe('row-0');
        expect(rows.map((r) => r.id)).toEqual(['row-1']);
    });

    it('does not treat a multi-block first row as a hero', () => {
        const config = makeConfig([
            [block('a', 'ask-ai-hero'), block('b', 'resources')],
        ]);
        const { heroRow, rows } = resolveHomepageLayout(config);
        expect(heroRow).toBeNull();
        expect(rows).toHaveLength(1);
    });

    it('does not treat a non-hero single block as a leading hero', () => {
        const config = makeConfig([[block('a', 'markdown')]]);
        const { heroRow, rows } = resolveHomepageLayout(config);
        expect(heroRow).toBeNull();
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
            [block('h', 'hero')], // section, but first -> none
            [block('t', 'markdown')], // grouped -> tucks under hero
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
});
