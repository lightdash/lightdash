import { describe, expect, it } from 'vitest';
import {
    parseMemoryCitations,
    parseProjectContextCitations,
    stripAgentCitations,
    stripMemoryCitations,
    stripProjectContextCitations,
} from './citations';

describe('memory citations', () => {
    it('parses well-formed and self-closing markers', () => {
        expect(
            parseMemoryCitations(
                'One.<ld-mem-cite id="first"></ld-mem-cite> Two.<ld-mem-cite id="second" />',
            ),
        ).toMatchObject({
            slugs: ['first', 'second'],
            malformedCount: 0,
        });
    });

    it('deduplicates multiple adjacent markers', () => {
        expect(
            parseMemoryCitations(
                '<ld-mem-cite id="first"></ld-mem-cite><ld-mem-cite id="first" />',
            ).slugs,
        ).toEqual(['first']);
    });

    it('ignores code-fence occurrences', () => {
        expect(
            parseMemoryCitations(
                '```html\n<ld-mem-cite id="example"></ld-mem-cite>\n```',
            ),
        ).toMatchObject({ slugs: [], malformedCount: 0 });
    });

    it('reports malformed markers without citing them', () => {
        expect(
            parseMemoryCitations('<ld-mem-cite id="Uppercase" />'),
        ).toMatchObject({
            slugs: [],
            malformedCount: 1,
        });
        expect(parseMemoryCitations('<ld-mem-cite>')).toMatchObject({
            slugs: [],
            malformedCount: 1,
        });
    });

    it('strips marker tags from prose and code fences', () => {
        expect(
            stripMemoryCitations(
                'Before <ld-mem-cite id="first"></ld-mem-cite> ```html\n<ld-mem-cite id="example" />\n``` after',
            ),
        ).toBe('Before  ```html\n\n``` after');
    });
});

describe('project context citations', () => {
    it('parses entry ids that are not memory slugs', () => {
        expect(
            parseProjectContextCitations(
                'One.<ld-ctx-cite id="ARR_definition"></ld-ctx-cite> Two.<ld-ctx-cite id="order.status" />',
            ),
        ).toMatchObject({
            ids: ['ARR_definition', 'order.status'],
            malformedCount: 0,
        });
    });

    it('counts repeat citations of the same entry once', () => {
        expect(
            parseProjectContextCitations(
                '<ld-ctx-cite id="arr"></ld-ctx-cite><ld-ctx-cite id="arr" />',
            ),
        ).toMatchObject({ ids: ['arr'], citationCounts: { arr: 2 } });
    });

    it('ignores code-fence occurrences and reports malformed markers', () => {
        expect(
            parseProjectContextCitations(
                '```html\n<ld-ctx-cite id="arr"></ld-ctx-cite>\n```',
            ),
        ).toMatchObject({ ids: [], malformedCount: 0 });
        expect(parseProjectContextCitations('<ld-ctx-cite>')).toMatchObject({
            ids: [],
            malformedCount: 1,
        });
    });

    it('strips only its own tag', () => {
        expect(
            stripProjectContextCitations(
                'A<ld-ctx-cite id="arr" />B<ld-mem-cite id="first" />',
            ),
        ).toBe('AB<ld-mem-cite id="first" />');
    });
});

describe('stripAgentCitations', () => {
    it('removes both memory and project-context markers', () => {
        expect(
            stripAgentCitations(
                'Answer.<ld-mem-cite id="first"></ld-mem-cite><ld-ctx-cite id="arr"></ld-ctx-cite>',
            ),
        ).toBe('Answer.');
    });
});
