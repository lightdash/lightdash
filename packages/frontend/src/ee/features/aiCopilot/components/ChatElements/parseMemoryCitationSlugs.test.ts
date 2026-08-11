import { describe, expect, it } from 'vitest';
import {
    parseMemoryCitations,
    parseMemoryCitationSlugs,
    stripMalformedMemoryCitations,
} from './parseMemoryCitationSlugs';

describe('parseMemoryCitations', () => {
    it('splits citations by source attribute, defaulting to memory', () => {
        const markdown =
            'a<ld-mem-cite id="legacy-mem"></ld-mem-cite> b<ld-mem-cite source="context" id="ctx-slug-3fa9c2d1" /> c<ld-mem-cite id="mem-slug-a1b2c3d4" source="memory" />';
        expect(parseMemoryCitations(markdown)).toEqual([
            { source: 'memory', slug: 'legacy-mem' },
            { source: 'context', slug: 'ctx-slug-3fa9c2d1' },
            { source: 'memory', slug: 'mem-slug-a1b2c3d4' },
        ]);
    });

    it('ignores unknown sources', () => {
        expect(
            parseMemoryCitations('<ld-mem-cite source="wat" id="slug-one" />'),
        ).toEqual([]);
    });
});

describe('parseMemoryCitationSlugs', () => {
    it('returns memory-tier slugs only', () => {
        const markdown =
            '<ld-mem-cite id="mem-one" /><ld-mem-cite source="context" id="ctx-slug-3fa9c2d1" />';
        expect(parseMemoryCitationSlugs(markdown)).toEqual(['mem-one']);
    });

    it('returns unique slugs in first-appearance order', () => {
        const markdown =
            'a<ld-mem-cite id="beta-two"></ld-mem-cite> b<ld-mem-cite id="alpha-one"/> c<ld-mem-cite id="beta-two"></ld-mem-cite>';
        expect(parseMemoryCitationSlugs(markdown)).toEqual([
            'beta-two',
            'alpha-one',
        ]);
    });

    it('ignores citations inside fenced code blocks', () => {
        const markdown =
            '```\n<ld-mem-cite id="in-code"></ld-mem-cite>\n```\ntext<ld-mem-cite id="in-prose"></ld-mem-cite>';
        expect(parseMemoryCitationSlugs(markdown)).toEqual(['in-prose']);
    });

    it('ignores malformed citations', () => {
        const markdown =
            '<ld-mem-cite id="Bad_Slug"></ld-mem-cite><ld-mem-cite>no id</ld-mem-cite>';
        expect(parseMemoryCitationSlugs(markdown)).toEqual([]);
    });

    it('ignores citations inside an unclosed fence, matching rendering', () => {
        const markdown =
            'prose<ld-mem-cite id="in-prose" />\n```\n<ld-mem-cite id="in-code" />';
        expect(parseMemoryCitationSlugs(markdown)).toEqual(['in-prose']);
    });

    it('closes a longer fence only with a fence of at least that length', () => {
        const markdown =
            '````\n```\n<ld-mem-cite id="in-code" />\n````\n<ld-mem-cite id="in-prose" />';
        expect(parseMemoryCitationSlugs(markdown)).toEqual(['in-prose']);
    });

    it('returns empty for plain markdown', () => {
        expect(parseMemoryCitationSlugs('no citations here')).toEqual([]);
    });
});

describe('stripMalformedMemoryCitations', () => {
    it('removes tags with a duplicated source attribute', () => {
        expect(
            stripMalformedMemoryCitations(
                'a<ld-mem-cite source="memory" id="dup-slug" source="context" /> b',
            ),
        ).toBe('a b');
    });

    it('removes tags with an unknown source', () => {
        expect(
            stripMalformedMemoryCitations(
                'a<ld-mem-cite source="wat" id="bad-slug" /> b',
            ),
        ).toBe('a b');
    });

    it('keeps valid memory and context tags', () => {
        const markdown =
            'a<ld-mem-cite id="mem-one" /> b<ld-mem-cite source="context" id="ctx-one"></ld-mem-cite>';
        expect(stripMalformedMemoryCitations(markdown)).toBe(markdown);
    });

    it('leaves fenced code untouched, malformed tags included', () => {
        const markdown =
            '```\n<ld-mem-cite source="wat" id="in-code" />\n```\n<ld-mem-cite source="wat" id="in-prose" />';
        expect(stripMalformedMemoryCitations(markdown)).toBe(
            '```\n<ld-mem-cite source="wat" id="in-code" />\n```\n',
        );
    });
});
