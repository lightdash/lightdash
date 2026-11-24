import { findMetricsToRun, findNewModelAdvice } from './draftLint';

describe('findMetricsToRun', () => {
    it('names the metrics a change adds or redefines, and no others', () => {
        expect(
            findMetricsToRun(
                'orders',
                [
                    { path: 'metrics.total', action: 'added' },
                    {
                        path: 'dimensions.amount.metrics.net.sql',
                        action: 'redefined',
                    },
                    { path: 'metrics.net_rate.filters', action: 'removed' },
                    { path: 'metrics.total.label', action: 'patched' },
                    { path: 'metrics.renamed.label', action: 'patched' },
                    { path: 'metrics.gone', action: 'removed' },
                    { path: 'dimensions.status', action: 'added' },
                ],
                null,
            ),
        ).toEqual(['orders_total', 'orders_net', 'orders_net_rate']);
    });

    it('names every metric of a model that is new', () => {
        expect(
            findMetricsToRun(
                'orders',
                [{ path: 'orders', action: 'created' }],
                `type: model
name: orders
sql_from: public.orders
dimensions:
  - name: id
    type: number
    sql: \${TABLE}.id
    metrics:
      order_count:
        type: count_distinct
metrics:
  total:
    type: sum
    sql: \${TABLE}.id
`,
            ),
        ).toEqual(['orders_order_count', 'orders_total']);
    });
});

describe('findNewModelAdvice', () => {
    const base = `type: model
name: orders
sql_from: public.orders
dimensions:
  - name: id
    type: number
    sql: \${TABLE}.id
metrics:
  total:
    type: sum
    sql: \${TABLE}.id
`;

    it('names a missing primary key and metrics without a description', () => {
        expect(findNewModelAdvice('orders', base)).toEqual([
            'no primary_key: set it to the columns that identify one row; it is checked on the warehouse',
            'no description on total: say in one sentence what each measures',
        ]);
    });

    it('has nothing to say about a model that has both', () => {
        expect(
            findNewModelAdvice(
                'orders',
                `${base}    description: Sum of ids\nprimary_key: id\n`,
            ),
        ).toEqual([]);
    });
});
