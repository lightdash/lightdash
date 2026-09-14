import { describe, expect, it } from 'vitest';
import { parseMemoryCitationSlugs } from './parseMemoryCitationSlugs';

describe('parseMemoryCitationSlugs', () => {
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
