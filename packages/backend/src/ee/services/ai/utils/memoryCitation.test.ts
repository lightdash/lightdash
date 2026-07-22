import { describe, expect, it } from 'vitest';
import { parseMemoryCitations, stripMemoryCitations } from './memoryCitation';

describe('memory citations', () => {
    it('parses well-formed and self-closing markers', () => {
        expect(
            parseMemoryCitations(
                'One.<ld-mem-cite id="first"></ld-mem-cite> Two.<ld-mem-cite id="second" />',
            ),
        ).toEqual({ slugs: ['first', 'second'], malformedCount: 0 });
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
        ).toEqual({ slugs: [], malformedCount: 0 });
    });

    it('reports malformed markers without citing them', () => {
        expect(parseMemoryCitations('<ld-mem-cite id="Uppercase" />')).toEqual({
            slugs: [],
            malformedCount: 1,
        });
        expect(parseMemoryCitations('<ld-mem-cite>')).toEqual({
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
