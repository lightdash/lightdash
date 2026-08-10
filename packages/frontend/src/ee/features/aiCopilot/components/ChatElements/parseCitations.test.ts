import { describe, expect, it } from 'vitest';
import { parseCitations } from './parseCitations';

describe('parseCitations', () => {
    it('returns unique citations across both marker kinds in reading order', () => {
        expect(
            parseCitations(
                [
                    'First.<ld-mem-cite id="alpha"></ld-mem-cite>',
                    'Second.<ld-cite source="context" id="beta-3fa9c2d1" />',
                    'Third.<ld-cite source="memory" id="gamma"></ld-cite>',
                    'Repeat.<ld-mem-cite id="alpha" />',
                ].join(' '),
            ),
        ).toEqual([
            { source: 'memory', slug: 'alpha' },
            { source: 'context', slug: 'beta-3fa9c2d1' },
            { source: 'memory', slug: 'gamma' },
        ]);
    });

    it('tolerates attribute order', () => {
        expect(
            parseCitations('<ld-cite id="beta-3fa9c2d1" source="context" />'),
        ).toEqual([{ source: 'context', slug: 'beta-3fa9c2d1' }]);
    });

    it('keeps the two tiers apart when slugs collide', () => {
        expect(
            parseCitations(
                '<ld-cite source="memory" id="same" /><ld-cite source="context" id="same" />',
            ),
        ).toEqual([
            { source: 'memory', slug: 'same' },
            { source: 'context', slug: 'same' },
        ]);
    });

    it('ignores citations inside fenced code blocks', () => {
        expect(
            parseCitations(
                '```\n<ld-mem-cite id="in-code"></ld-mem-cite>\n<ld-cite source="context" id="also-in-code" />\n```\ntext<ld-mem-cite id="in-prose"></ld-mem-cite>',
            ),
        ).toEqual([{ source: 'memory', slug: 'in-prose' }]);
    });

    it('counts an unclosed marker, matching what the renderer numbers', () => {
        expect(
            parseCitations(
                'a<ld-cite source="context" id="beta-3fa9c2d1">b<ld-mem-cite id="alpha">',
            ),
        ).toEqual([
            { source: 'context', slug: 'beta-3fa9c2d1' },
            { source: 'memory', slug: 'alpha' },
        ]);
    });

    it.each([
        ['unknown source', '<ld-cite source="catalog" id="slug" />'],
        ['missing source', '<ld-cite id="slug" />'],
        ['missing id', '<ld-cite source="context" />'],
        ['invalid slug', '<ld-cite source="memory" id="Bad_Slug" />'],
        ['legacy invalid slug', '<ld-mem-cite id="Bad_Slug"></ld-mem-cite>'],
        ['legacy without id', '<ld-mem-cite>no id</ld-mem-cite>'],
    ])('ignores a %s marker', (_label, markup) => {
        expect(parseCitations(markup)).toEqual([]);
    });

    it('returns empty for plain markdown', () => {
        expect(parseCitations('no citations here')).toEqual([]);
    });
});
