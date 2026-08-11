import { describe, expect, it } from 'vitest';
import {
    parseMemoryCitations,
    stripMalformedMemoryCitations,
} from './parseMemoryCitationSlugs';

const parseSlugs = (markdown: string) =>
    parseMemoryCitations(markdown).map((citation) => citation.slug);

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

    it('ignores tags with anchor-text bodies', () => {
        expect(
            parseSlugs(
                '<ld-mem-cite id="with-body">anchor</ld-mem-cite><ld-mem-cite id="empty-pair"></ld-mem-cite>',
            ),
        ).toEqual(['empty-pair']);
    });

    it('accepts whitespace-only pairs', () => {
        expect(
            parseSlugs('<ld-mem-cite id="ws-pair">  </ld-mem-cite>'),
        ).toEqual(['ws-pair']);
    });

    it('ignores citations inside HTML comments, matching rendering', () => {
        const markdown =
            '<!-- <ld-mem-cite id="in-comment" /> -->text<ld-mem-cite id="in-prose" />';
        expect(parseSlugs(markdown)).toEqual(['in-prose']);
    });

    it('treats an unclosed HTML comment as running to EOF', () => {
        const markdown =
            'a<ld-mem-cite id="in-prose" /> <!-- b<ld-mem-cite id="in-comment" />';
        expect(parseSlugs(markdown)).toEqual(['in-prose']);
    });
});

describe('parseMemoryCitations fence and dedupe behavior', () => {
    it('returns unique slugs in first-appearance order', () => {
        const markdown =
            'a<ld-mem-cite id="beta-two"></ld-mem-cite> b<ld-mem-cite id="alpha-one"/> c<ld-mem-cite id="beta-two"></ld-mem-cite>';
        expect(parseSlugs(markdown)).toEqual(['beta-two', 'alpha-one']);
    });

    it('ignores citations inside fenced code blocks', () => {
        const markdown =
            '```\n<ld-mem-cite id="in-code"></ld-mem-cite>\n```\ntext<ld-mem-cite id="in-prose"></ld-mem-cite>';
        expect(parseSlugs(markdown)).toEqual(['in-prose']);
    });

    it('ignores malformed citations', () => {
        const markdown =
            '<ld-mem-cite id="Bad_Slug"></ld-mem-cite><ld-mem-cite>no id</ld-mem-cite>';
        expect(parseSlugs(markdown)).toEqual([]);
    });

    it('ignores citations inside an unclosed fence, matching rendering', () => {
        const markdown =
            'prose<ld-mem-cite id="in-prose" />\n```\n<ld-mem-cite id="in-code" />';
        expect(parseSlugs(markdown)).toEqual(['in-prose']);
    });

    it('closes a longer fence only with a fence of at least that length', () => {
        const markdown =
            '````\n```\n<ld-mem-cite id="in-code" />\n````\n<ld-mem-cite id="in-prose" />';
        expect(parseSlugs(markdown)).toEqual(['in-prose']);
    });

    it('returns empty for plain markdown', () => {
        expect(parseSlugs('no citations here')).toEqual([]);
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

    it('unwraps pairs with anchor-text bodies, keeping the text', () => {
        expect(
            stripMalformedMemoryCitations(
                'see <ld-mem-cite id="with-body">the revenue metric</ld-mem-cite> here',
            ),
        ).toBe('see the revenue metric here');
    });

    it('leaves fenced code untouched, malformed tags included', () => {
        const markdown =
            '```\n<ld-mem-cite source="wat" id="in-code" />\n```\n<ld-mem-cite source="wat" id="in-prose" />';
        expect(stripMalformedMemoryCitations(markdown)).toBe(
            '```\n<ld-mem-cite source="wat" id="in-code" />\n```\n',
        );
    });
});
