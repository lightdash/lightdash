import { describe, expect, it } from 'vitest';
import {
    holdsEntry,
    insertSnippet,
    insertionPoint,
    replaceLine,
    replacementFor,
} from './snippetInsertion';

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

describe('holdsEntry', () => {
    const snippet =
        '    columns:\n      - name: number_of_floors\n        description: Storeys';
    it('is true once the entry line is in the file, at any indent and with other wording below it', () => {
        expect(
            holdsEntry(
                'columns:\n  - name: number_of_floors\n    description: my own words\n',
                snippet,
            ),
        ).toBe(true);
    });
    it('is false for the untouched file and for a half-typed entry', () => {
        expect(holdsEntry('columns:\n  - name: building_id\n', snippet)).toBe(
            false,
        );
        expect(holdsEntry('columns:\n  - name: number_of\n', snippet)).toBe(
            false,
        );
    });
});

describe('replaceLine', () => {
    const chart = [
        'contentType: chart',
        'description: Revenue split across each payment method',
        'name: Revenue by payment method',
        'slug: revenue-by-payment-method',
        'version: 1',
        '',
    ].join('\n');

    it('sets the top-level key to the new value and leaves the rest', () => {
        expect(replaceLine(chart, 'name: Revenue by payment type')).toBe(
            chart.replace(
                'name: Revenue by payment method',
                'name: Revenue by payment type',
            ),
        );
    });

    it('never touches a nested key of the same name', () => {
        const nested = 'tableConfig:\n  name: inner\nname: outer\n';
        expect(replaceLine(nested, 'name: changed')).toBe(
            'tableConfig:\n  name: inner\nname: changed\n',
        );
    });

    it('does nothing when the line already reads that way', () => {
        expect(
            replacementFor(chart, 'name: Revenue by payment method'),
        ).toBeNull();
        expect(replaceLine(chart, 'name: Revenue by payment method')).toBe(
            chart,
        );
    });

    it('puts the line back at the end of a file that has lost the key', () => {
        const withoutName = chart.replace(
            'name: Revenue by payment method\n',
            '',
        );
        expect(replaceLine(withoutName, 'name: Revenue by payment type')).toBe(
            `${withoutName}name: Revenue by payment type\n`,
        );
        // A file that does not end in a newline gets one first.
        expect(replaceLine('slug: a', 'name: A')).toBe('slug: a\nname: A\n');
        expect(replaceLine('', 'name: A')).toBe('name: A\n');
    });

    it('reads a Windows file line by line too', () => {
        expect(replaceLine('name: Old\r\nslug: a\r\n', 'name: New')).toBe(
            'name: New\nslug: a\r\n',
        );
    });

    it('refuses a block, which is an insertion, not a one-line edit', () => {
        expect(replacementFor(chart, 'name: a\nslug: b')).toBeNull();
    });
});
