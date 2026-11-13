import { describe, expect, it } from 'vitest';
import { runDbtCodeMode } from './dbtCodeMode';

const ORDERS = `version: 2
models:
  # Orders, one row per order.
  - name: orders
    description: Every order placed.
    meta:
      metrics:
        order_count:
          type: count
    columns:
      - name: order_id
        description: >-
          The order's id.
      - name: customer_id
        description: Who placed it.
      - name: amount
`;

const repo = (files: Record<string, string>) => ({
    findModelFile: async (model: string) =>
        model === 'orders' ? 'models/orders.yml' : null,
    readFile: async (path: string) => files[path] ?? null,
});

describe('runDbtCodeMode', () => {
    it('edits the YAML in place, keeping comments and untouched lines', async () => {
        const started = performance.now();
        const { edits, logs, error } = await runDbtCodeMode(
            `
            const orders = dbt.model('orders');
            for (const column of orders.columns.filter((c) => c.name.endsWith('_id'))) {
                dbt.addMetric('orders', {
                    name: 'unique_' + column.name + 's',
                    type: 'count_distinct',
                    column: column.name,
                });
            }
            dbt.setDescription('orders', 'amount', 'Order total in dollars.');
            console.log(orders.metrics.join(','));
            `,
            repo({ 'models/orders.yml': ORDERS }),
        );
        const elapsed = performance.now() - started;

        expect(error).toBeNull();
        expect(logs).toEqual(['order_count']);
        expect(edits).toHaveLength(1);
        const { after } = edits[0];
        expect(after).toContain('# Orders, one row per order.');
        expect(after).toContain('description: >-');
        expect(after).toMatch(
            /- name: order_id\n {8}description: >-\n {10}The order's id.\n {8}meta:\n {10}metrics:\n {12}unique_order_ids:\n {14}type: count_distinct/,
        );
        expect(after).toContain('unique_customer_ids:');
        expect(after).toContain(
            '- name: amount\n        description: Order total in dollars.',
        );
        // Every original line survives; the script only adds.
        ORDERS.split('\n').forEach((line) => expect(after).toContain(line));
        expect(elapsed).toBeLessThan(1000);
    });

    it('changes nothing when the script fails partway', async () => {
        const { edits, error } = await runDbtCodeMode(
            `
            dbt.setDescription('orders', null, 'Changed');
            dbt.addMetric('orders', { name: 'order_count', type: 'count' });
            `,
            repo({ 'models/orders.yml': ORDERS }),
        );
        expect(error).toBe('order_count already exists');
        expect(edits).toEqual([]);
    });

    it('has no way out of the sandbox', async () => {
        const { error } = await runDbtCodeMode(
            `if (typeof fetch !== 'undefined' || typeof require !== 'undefined' || typeof process !== 'undefined') throw new Error('escaped');
             dbt.model('payments');`,
            repo({ 'models/orders.yml': ORDERS }),
        );
        expect(error).toBe('No YAML file describes the model payments');
    });

    it('stops a script that never ends', async () => {
        const { error } = await runDbtCodeMode(
            'while (true) {}',
            repo({ 'models/orders.yml': ORDERS }),
            { timeoutMs: 100 },
        );
        expect(error).toMatch(/interrupted/i);
    });
});
