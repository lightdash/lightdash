import { describe, expect, it } from 'vitest';
import { stripQueryNodeReferences } from './queryNodeReference';

describe('stripQueryNodeReferences', () => {
    it('drops the reference and its label', () => {
        expect(
            stripQueryNodeReferences(
                'Revenue was $404 [revenue](#query-node-revenue) from 12 [orders](#query-node-orders_2).',
            ),
        ).toBe('Revenue was $404 from 12.');
    });

    it('drops references inside a Markdown table cell', () => {
        expect(
            stripQueryNodeReferences(
                '| Month | Revenue |\n|---|---:|\n| May | $404 [revenue](#query-node-revenue) |',
            ),
        ).toBe('| Month | Revenue |\n|---|---:|\n| May | $404 |');
    });

    it('keeps other links', () => {
        const text =
            'See [the chart](https://example.com/saved/1/view#chart-link) and [a section](#query-node-) here.';
        expect(stripQueryNodeReferences(text)).toBe(text);
    });
});
