import { diffModelDocuments } from '@lightdash/common';
import { foldDraft, foldProposal, toDraftEdit } from './draftFold';

const current = `type: model
name: orders
label: Orders
sql_from: public.orders
dimensions:
  - name: amount
    type: number
    sql: \${TABLE}.amount
    description: Order total
    metrics:
      revenue:
        type: sum
      order_count:
        type: count
  - name: customer_id
    type: number
    sql: \${TABLE}.customer_id
metrics:
  average_amount:
    type: number
    sql: AVG(\${amount})
joins:
  - join: customers
    alias: buyer
    sql_on: \${orders.customer_id} = \${buyer.id}
`;

const edited = `type: model
name: orders
sql_from: public.orders
description: Every order
dimensions:
  - name: amount
    type: number
    sql: \${TABLE}.amount_usd
    metrics:
      revenue:
        type: sum
        label: Revenue
      total:
        type: max
  - name: status
    type: string
    sql: \${TABLE}.status
metrics:
  median_amount:
    type: number
    sql: MEDIAN(\${amount})
joins:
  - join: customers
    alias: buyer
    sql_on: \${orders.customer_id} = \${buyer.customer_id}
    label: Buyer
`;

describe('toDraftEdit', () => {
    it('folds back to exactly what was edited', () => {
        const items = toDraftEdit('orders', current, edited);
        const { writes, results } = foldDraft(new Map([['orders', current]]), [
            items,
        ]);
        expect(results[0].every(({ refusals }) => refusals.length === 0)).toBe(
            true,
        );
        expect(
            diffModelDocuments(writes.get('orders') ?? null, edited),
        ).toEqual([]);
    });

    it('puts removals first and changes nothing for an edit of comments alone', () => {
        expect(toDraftEdit('orders', current, `# Note\n${current}`)).toEqual(
            [],
        );
        expect(toDraftEdit('orders', current, edited)[0]).toMatchObject({
            yaml: null,
            remove: expect.arrayContaining([
                'dimensions.customer_id',
                'dimensions.amount.metrics.order_count',
                'metrics.average_amount',
            ]),
        });
    });
});

describe('foldDraft', () => {
    it('moves a metric to a new dimension in one item', () => {
        const { writes, results } = foldDraft(new Map([['orders', current]]), [
            [
                {
                    name: 'orders',
                    yaml: 'dimensions:\n  - name: status\n    type: string\n    sql: ${TABLE}.status\n    metrics:\n      order_count:\n        type: count\n',
                    remove: ['dimensions.amount.metrics.order_count'],
                    removeModel: false,
                },
            ],
        ]);
        expect(results[0][0]).toMatchObject({
            status: 'ready',
            changes: [
                {
                    path: 'dimensions.amount.metrics.order_count',
                    action: 'removed',
                },
                { path: 'dimensions.status', action: 'added' },
            ],
            refusals: [],
        });
        expect(writes.get('orders')).toMatch(
            /name: status[\s\S]*order_count:\n\s+type: count/,
        );
    });
});

const ORDER_COUNT = '      order_count:\n        type: count\n';
const PLACES = ['none', 'amount', 'status', 'customer_id', 'top'] as const;

/** Every shape of one small model: which dimensions it has and where its metrics sit. */
const SHAPES = [true, false].flatMap((hasStatus) =>
    [true, false].flatMap((hasCustomer) =>
        [true, false].flatMap((hasRevenue) =>
            PLACES.filter(
                (place) =>
                    (place !== 'status' || hasStatus) &&
                    (place !== 'customer_id' || hasCustomer),
            ).map((place) => {
                const dimension = (name: string, metrics: string) =>
                    `  - name: ${name}\n    type: number\n    sql: \${TABLE}.${name}\n${
                        metrics ? `    metrics:\n${metrics}` : ''
                    }`;
                const under = (name: string) =>
                    place === name ? ORDER_COUNT : '';
                return [
                    'type: model\nname: orders\nsql_from: public.orders\ndimensions:\n',
                    dimension(
                        'amount',
                        `${hasRevenue ? '      revenue:\n        type: sum\n' : ''}${under('amount')}`,
                    ),
                    hasStatus ? dimension('status', under('status')) : '',
                    hasCustomer
                        ? dimension('customer_id', under('customer_id'))
                        : '',
                    place === 'top'
                        ? 'metrics:\n  order_count:\n    type: number\n    sql: COUNT(*)\n'
                        : '',
                ].join('');
            }),
        ),
    ),
);

const EDITS = SHAPES.flatMap((from) =>
    SHAPES.filter((to) => to !== from).map((to) => ({ from, to })),
);

describe('foldProposal', () => {
    it('turns any shape of a model into any other, whatever moves or goes', () => {
        const wrong = EDITS.filter(({ from, to }) => {
            const { writes, results } = foldProposal(
                new Map([['orders', from]]),
                [],
                toDraftEdit('orders', from, to),
            );
            return (
                results.some(({ status }) => status === 'failed') ||
                diffModelDocuments(writes.get('orders') ?? null, to).length > 0
            );
        });
        expect(wrong).toEqual([]);
    });

    it('keeps none of a model whose change has a refused part, and all of the others', () => {
        const refused = {
            name: 'orders',
            yaml: 'dimensions:\n  - name: amount\n    tags: [finance]\n',
            remove: [],
            removeModel: false,
        };
        const other = {
            name: 'customers',
            yaml: 'sql_from: public.customers\ndimensions:\n  - name: id\n    type: number\n    sql: ${TABLE}.id\n',
            remove: [],
            removeModel: false,
        };
        const partly = EDITS.filter(({ from, to }) => {
            const { writes, results } = foldProposal(
                new Map([['orders', from]]),
                [],
                [...toDraftEdit('orders', from, to), refused, other],
            );
            const last = results.at(-1);
            return !(
                results
                    .slice(0, -1)
                    .every(
                        ({ status, changes }) =>
                            status === 'failed' && changes.length === 0,
                    ) &&
                !writes.has('orders') &&
                last?.status === 'ready' &&
                last.refusals.length === 0 &&
                writes.has('customers')
            );
        });
        expect(partly).toEqual([]);
    });

    it('says why on the refused part and leaves what is already drafted alone', () => {
        const drafted = [
            {
                name: 'orders',
                yaml: 'label: All orders\n',
                remove: [],
                removeModel: false,
            },
        ];
        const { writes, results } = foldProposal(
            new Map([['orders', current]]),
            [drafted],
            [
                {
                    name: 'orders',
                    yaml: null,
                    remove: ['dimensions.amount.metrics.order_count'],
                    removeModel: false,
                },
                {
                    name: 'orders',
                    yaml: 'dimensions:\n  - name: status\n    type: string\n    sql: ${TABLE}.status\n    metrics:\n      revenue:\n        type: count\n',
                    remove: [],
                    removeModel: false,
                },
            ],
        );
        expect(results).toMatchObject([
            { status: 'failed', changes: [], refusals: [] },
            {
                status: 'failed',
                changes: [],
                refusals: [{ path: 'dimensions.status', reason: 'name_taken' }],
            },
        ]);
        expect(writes.get('orders')).toContain('label: All orders');
        expect(writes.get('orders')).toContain('order_count');
    });
});
