import { describe, expect, it } from 'vitest';
import {
    parseMemoryCitations,
    parseMemoryCitationSlugs,
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

    it('returns empty for plain markdown', () => {
        expect(parseMemoryCitationSlugs('no citations here')).toEqual([]);
    });
});
