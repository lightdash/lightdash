import { describe, expect, it } from 'vitest';
import { insertSnippet, insertionPoint } from './snippetInsertion';

const file = [
    'columns:',
    '  - name: a',
    '    meta:',
    '      metrics:',
    '        old:',
    '          type: sum',
    '  - name: b',
    '    meta:',
    '      metrics:',
    '        older:',
    '          type: count',
    '      additional_dimensions:',
    '        d:',
    '          type: string',
].join('\n');

describe('insertSnippet', () => {
    it("merges the children under the last line that is the snippet's own key", () => {
        const snippet =
            '      metrics:\n        fresh:\n          type: average';
        const out = insertSnippet(file, snippet).split('\n');
        expect(out.slice(8, 11)).toEqual([
            '      metrics:',
            '        fresh:',
            '          type: average',
        ]);
        expect(out).toHaveLength(16);
        expect(insertionPoint(file, snippet).parentLine).toBe(8);
    });

    it('finds the named key even when other keys share its indent later in the file', () => {
        // metrics: of column b sits at the same indent after additional_dimensions:
        // would in a longer file; the key name, not the indent, decides.
        const snippet =
            '      additional_dimensions:\n        fresh:\n          type: number';
        const out = insertSnippet(file, snippet).split('\n');
        expect(out.slice(11, 14)).toEqual([
            '      additional_dimensions:',
            '        fresh:',
            '          type: number',
        ]);
    });

    it('puts the whole snippet under the key one level up when its key does not exist yet', () => {
        const small = ['meta:', '  dimension:', '    type: number'].join('\n');
        const snippet = '  metrics:\n    fresh:\n      type: sum';
        expect(insertSnippet(small, snippet)).toBe(
            [
                'meta:',
                '  metrics:',
                '    fresh:',
                '      type: sum',
                '  dimension:',
                '    type: number',
            ].join('\n'),
        );
    });

    it('appends after a newline when nothing places it', () => {
        expect(insertSnippet('existing', 'x')).toBe('existing\nx');
        expect(insertSnippet('existing\n', 'x')).toBe('existing\nx');
        expect(insertSnippet('', 'x')).toBe('x');
        expect(insertionPoint('existing', 'x').parentLine).toBeNull();
    });

    it('appends under a key that is the last line', () => {
        expect(
            insertSnippet('meta:\n  metrics:', '  metrics:\n    fresh: 1'),
        ).toBe('meta:\n  metrics:\n    fresh: 1');
    });
});
