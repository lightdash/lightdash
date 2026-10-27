import { type Element, type Root } from 'hast';
import { describe, expect, it } from 'vitest';
import {
    getQueryNodeReferenceIndices,
    rehypeQueryNodeReferences,
} from './rehypeQueryNodeReferences';

const process = (hrefs: string[]) => {
    const markdown = hrefs.map((href) => `[x](${href})`).join('\n\n');
    const tree: Root = {
        type: 'root',
        children: hrefs.map(
            (href): Element => ({
                type: 'element',
                tagName: 'a',
                properties: { href },
                children: [],
            }),
        ),
    };
    rehypeQueryNodeReferences({
        indices: getQueryNodeReferenceIndices(markdown),
    })(tree);
    return tree.children.map((child) => (child as Element).properties);
};

describe('rehypeQueryNodeReferences', () => {
    it('numbers nodes by first appearance and reuses the index for a repeated node', () => {
        expect(
            process([
                '#query-node-revenue',
                '#query-node-orders_2',
                '#query-node-revenue',
            ]),
        ).toEqual([
            {
                href: '#query-node-revenue',
                'data-content-type': 'query-node-link',
                'data-node-id': 'revenue',
                'data-reference-index': 1,
            },
            {
                href: '#query-node-orders_2',
                'data-content-type': 'query-node-link',
                'data-node-id': 'orders_2',
                'data-reference-index': 2,
            },
            {
                href: '#query-node-revenue',
                'data-content-type': 'query-node-link',
                'data-node-id': 'revenue',
                'data-reference-index': 1,
            },
        ]);
    });

    it('numbers across Markdown blocks from the message text, not per tree', () => {
        const indices = getQueryNodeReferenceIndices(
            'Revenue $404 [revenue](#query-node-revenue).\n\nOrders 12 [orders](#query-node-orders) and [again](#query-node-revenue).',
        );
        expect(indices).toEqual({ revenue: 1, orders: 2 });
    });

    it.each([
        '#query-node-',
        '#query-node-1abc',
        '#query-node-rev-enue',
        '/projects/p/saved/c/view#query-node-revenue',
        '#chart-link',
    ])('leaves %s untouched', (href) => {
        expect(process([href])).toEqual([{ href }]);
    });
});
