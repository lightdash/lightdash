import { diffModelDocuments } from '@lightdash/common';
import { foldDraft, toDraftEdit } from './draftFold';

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
