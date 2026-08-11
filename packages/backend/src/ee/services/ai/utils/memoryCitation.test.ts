import { describe, expect, it } from 'vitest';
import { parseMemoryCitations, stripMemoryCitations } from './memoryCitation';

describe('memory citations', () => {
    it('parses well-formed and self-closing markers as memory by default', () => {
        expect(
            parseMemoryCitations(
                'One.<ld-mem-cite id="first"></ld-mem-cite> Two.<ld-mem-cite id="second" />',
            ),
        ).toMatchObject({
            memory: { slugs: ['first', 'second'] },
            context: { slugs: [] },
            malformedCount: 0,
        });
    });

    it('splits citations by source attribute', () => {
        expect(
            parseMemoryCitations(
                '<ld-mem-cite source="memory" id="mem-a1b2c3d4" /><ld-mem-cite source="context" id="ctx-3fa9c2d1"></ld-mem-cite>',
            ),
        ).toMatchObject({
            memory: {
                slugs: ['mem-a1b2c3d4'],
                citationCounts: { 'mem-a1b2c3d4': 1 },
            },
            context: {
                slugs: ['ctx-3fa9c2d1'],
                citationCounts: { 'ctx-3fa9c2d1': 1 },
            },
            malformedCount: 0,
        });
    });

    it('accepts source after id', () => {
        expect(
            parseMemoryCitations(
                '<ld-mem-cite id="ctx-3fa9c2d1" source="context" />',
            ),
        ).toMatchObject({
            context: { slugs: ['ctx-3fa9c2d1'] },
            malformedCount: 0,
        });
    });

    it('keeps the same slug separate per tier', () => {
        const parsed = parseMemoryCitations(
            '<ld-mem-cite id="shared-slug" /><ld-mem-cite source="context" id="shared-slug" />',
        );
        expect(parsed.memory.slugs).toEqual(['shared-slug']);
        expect(parsed.context.slugs).toEqual(['shared-slug']);
    });

    it('deduplicates multiple adjacent markers and counts occurrences', () => {
        const parsed = parseMemoryCitations(
            '<ld-mem-cite id="first"></ld-mem-cite><ld-mem-cite id="first" />',
        );
        expect(parsed.memory.slugs).toEqual(['first']);
        expect(parsed.memory.citationCounts).toEqual({ first: 2 });
    });

    it('ignores code-fence occurrences', () => {
        expect(
            parseMemoryCitations(
                '```html\n<ld-mem-cite id="example"></ld-mem-cite>\n```\n~~~\n<ld-mem-cite source="context" id="ctx-3fa9c2d1" />\n~~~',
            ),
        ).toMatchObject({
            memory: { slugs: [] },
            context: { slugs: [] },
            malformedCount: 0,
        });
    });

    it('ignores citations inside an unclosed fence, matching rendering', () => {
        expect(
            parseMemoryCitations(
                'prose<ld-mem-cite id="in-prose" />\n```\n<ld-mem-cite id="in-code" />',
            ),
        ).toMatchObject({
            memory: { slugs: ['in-prose'] },
            malformedCount: 0,
        });
    });

    it('closes a longer fence only with a fence of at least that length', () => {
        expect(
            parseMemoryCitations(
                '````\n```\n<ld-mem-cite id="in-code" />\n````\n<ld-mem-cite id="in-prose" />',
            ),
        ).toMatchObject({
            memory: { slugs: ['in-prose'] },
            malformedCount: 0,
        });
    });

    it('counts an unknown source as malformed without citing it', () => {
        expect(
            parseMemoryCitations('<ld-mem-cite source="wat" id="first" />'),
        ).toMatchObject({
            memory: { slugs: [] },
            context: { slugs: [] },
            malformedCount: 1,
        });
    });

    it('counts a duplicated source attribute as malformed', () => {
        expect(
            parseMemoryCitations(
                '<ld-mem-cite source="memory" id="first" source="context" />',
            ),
        ).toMatchObject({
            memory: { slugs: [] },
            context: { slugs: [] },
            malformedCount: 1,
        });
    });

    it('reports malformed markers without citing them', () => {
        expect(
            parseMemoryCitations('<ld-mem-cite id="Uppercase" />'),
        ).toMatchObject({
            memory: { slugs: [] },
            malformedCount: 1,
        });
        expect(parseMemoryCitations('<ld-mem-cite>')).toMatchObject({
            memory: { slugs: [] },
            malformedCount: 1,
        });
    });

    it('strips marker tags from prose and code fences, source attr included', () => {
        expect(
            stripMemoryCitations(
                'Before <ld-mem-cite source="context" id="first"></ld-mem-cite> ```html\n<ld-mem-cite id="example" />\n``` after',
            ),
        ).toBe('Before  ```html\n\n``` after');
    });
});
