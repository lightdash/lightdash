import { DbtSchemaEditor, getErrorMessage } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    diffLineCounts,
    runCodeMode,
    validateSemanticLayerYaml,
    type CodeModeRepo,
} from './codeMode';

const ORDERS = `version: 2
models:
  # Orders, one row per order.
  - name: orders
    description: Every order placed.
    config:
      meta:
        joins:
          - join: customers
            sql_on: \${orders.customer_id} = \${customers.customer_id}
    columns:
      - name: order_id
        description: >-
          The order's id.
        config:
          meta:
            metrics:
              order_count:
                type: count_distinct
      - name: customer_id
        description: Who placed it.
      - name: amount
        config:
          meta:
            dimension:
              format: usd
`;

const repoOf = (files: Record<string, string>): CodeModeRepo => ({
    list: async () => Object.keys(files),
    read: async (path) => files[path] ?? null,
    findModel: async (name) =>
        name === 'orders'
            ? { yml: 'models/orders.yml', sql: 'models/orders.sql' }
            : null,
    validateYaml: (path, text) => {
        try {
            // eslint-disable-next-line no-new
            new DbtSchemaEditor(text, path);
            return null;
        } catch (e) {
            return getErrorMessage(e);
        }
    },
});

const run = (script: string, files = { 'models/orders.yml': ORDERS }) =>
    runCodeMode(script, repoOf(files));

/** Lines the edit added and removed, ignoring order. */
const changedLines = (before: string, after: string) => {
    const left = before.split('\n');
    const right = after.split('\n');
    return {
        added: right.filter((line) => !left.includes(line)),
        removed: left.filter((line) => !right.includes(line)),
    };
};

describe('runCodeMode', () => {
    it('adds metrics next to the ones a column already has', async () => {
        const { edits, error } = await run(`
            const { yml, keys } = dbt.model('orders');
            for (const column of yaml.get(yml, [...keys, 'columns']).filter((c) => c.name.endsWith('_id'))) {
                yaml.set(yml, [...keys, 'columns', { name: column.name }, 'config', 'meta', 'metrics', 'unique_' + column.name + 's'], {
                    type: 'count_distinct',
                    description: 'How many different ' + column.name + ' values there are across every order placed so far.',
                });
            }
        `);
        expect(error).toBeNull();
        const { after } = edits[0];
        expect(changedLines(ORDERS, after!).removed).toEqual([]);
        expect(after).toContain(
            `              order_count:
                type: count_distinct
              unique_order_ids:
                type: count_distinct
                description: >-
                  How many different order_id values there are across every
                  order placed so far.
`,
        );
        expect(after).toContain(`      - name: customer_id
        description: Who placed it.
        config:
          meta:
            metrics:
              unique_customer_ids:`);
    });

    it('changes a dimension setting in place', async () => {
        const { edits, error } = await run(`
            yaml.set('models/orders.yml', ['models', { name: 'orders' }, 'columns', { name: 'amount' }, 'config', 'meta', 'dimension', 'format'], 'eur');
            yaml.set('models/orders.yml', ['models', { name: 'orders' }, 'columns', { name: 'amount' }, 'config', 'meta', 'dimension', 'hidden'], true);
        `);
        expect(error).toBeNull();
        expect(changedLines(ORDERS, edits[0].after!)).toEqual({
            added: ['              format: eur', '              hidden: true'],
            removed: ['              format: usd'],
        });
    });

    it('adds a join, a column and a model description', async () => {
        const { edits, error } = await run(`
            const m = ['models', { name: 'orders' }];
            yaml.push('models/orders.yml', [...m, 'config', 'meta', 'joins'], { join: 'payments', sql_on: '\${orders.order_id} = \${payments.order_id}', relationship: 'one-to-many' });
            yaml.push('models/orders.yml', [...m, 'columns'], { name: 'status', description: 'Where the order is.' });
            yaml.set('models/orders.yml', [...m, 'description'], 'Every order placed, one row each.');
        `);
        expect(error).toBeNull();
        const { added, removed } = changedLines(ORDERS, edits[0].after!);
        expect(removed).toEqual(['    description: Every order placed.']);
        expect(added).toEqual([
            '    description: Every order placed, one row each.',
            '          - join: payments',
            '            sql_on: ${orders.order_id} = ${payments.order_id}',
            '            relationship: one-to-many',
            '      - name: status',
            '        description: Where the order is.',
        ]);
    });

    it('creates a model: its SQL file and its YAML', async () => {
        const { edits, error } = await run(`
            repo.write('models/order_items.sql', 'select * from {{ ref("stg_order_items") }}\\n');
            yaml.push('models/orders.yml', ['models'], { name: 'order_items', columns: [{ name: 'order_item_id' }] });
            console.log(repo.list('models/'));
        `);
        expect(error).toBeNull();
        expect(edits.map(({ path, before }) => [path, before])).toEqual([
            ['models/order_items.sql', null],
            ['models/orders.yml', ORDERS],
        ]);
        expect(edits[1].after).toMatch(
            /\n {2}- name: order_items\n {4}columns:\n {6}- name: order_item_id\n$/,
        );
    });

    it('removes a metric', async () => {
        const { edits, error } = await run(`
            yaml.remove('models/orders.yml', ['models', { name: 'orders' }, 'columns', { name: 'order_id' }, 'config', 'meta', 'metrics', 'order_count']);
        `);
        expect(error).toBeNull();
        expect(edits[0].after).toBe(
            ORDERS.replace(
                `        config:
          meta:
            metrics:
              order_count:
                type: count_distinct
`,
                '',
            ),
        );
    });

    it('refuses YAML the semantic layer would reject, changing nothing', async () => {
        const { edits, error } = await run(`
            yaml.set('models/orders.yml', ['models', { name: 'orders' }, 'columns', { name: 'amount' }, 'config', 'meta', 'metrics', 'total'], { type: 'not_a_metric_type' });
        `);
        expect(error).toMatch(/Invalid schema file: models\/orders\.yml/);
        expect(edits).toEqual([]);
    });

    it('changes nothing when the script fails partway', async () => {
        const { edits, error } = await run(`
            yaml.set('models/orders.yml', ['models', { name: 'orders' }, 'description'], 'Changed');
            yaml.remove('models/orders.yml', ['models', { name: 'nope' }]);
        `);
        expect(error).toBe('models.[name=nope] does not exist');
        expect(edits).toEqual([]);
    });

    it('has no way out of the sandbox', async () => {
        const { error } = await run(`
            if ([typeof fetch, typeof require, typeof process, typeof setTimeout].some((t) => t !== 'undefined')) throw new Error('escaped');
            throw new Error('contained');
        `);
        expect(error).toBe('contained');
    });

    it('stops a script that never ends', async () => {
        const { error } = await runCodeMode('while (true) {}', repoOf({}), {
            timeoutMs: 100,
        });
        expect(error).toMatch(/interrupted/i);
    });

    it('refuses paths outside the project', async () => {
        const { error } = await run(`repo.write('../secrets.yml', 'a: 1')`);
        expect(error).toBe('../secrets.yml is not a path inside the project');
    });
});

describe('validateSemanticLayerYaml', () => {
    const dbt = { isNative: false, dbtVersion: undefined as never };

    it('checks schema files and lets other YAML through', () => {
        expect(
            validateSemanticLayerYaml(
                'dbt_project.yml',
                'name: shop\nmodels:\n  shop:\n    +materialized: view\n',
                dbt,
            ),
        ).toBeNull();
        expect(
            validateSemanticLayerYaml(
                'models/orders.yml',
                'version: 2\nmodels:\n  - name: orders\n    meta:\n      metrics:\n        n:\n          type: nope\n',
                dbt,
            ),
        ).toMatch(/Invalid schema file/);
        expect(validateSemanticLayerYaml('a.yml', 'a: [', dbt)).toMatch(
            /^a\.yml: /,
        );
    });
});

describe('diffLineCounts', () => {
    it('counts added and removed lines', () => {
        expect(diffLineCounts('a\nb\nc', 'a\nB\nc\nd')).toEqual({
            additions: 2,
            deletions: 1,
        });
        expect(diffLineCounts(null, 'a\nb')).toEqual({
            additions: 2,
            deletions: 0,
        });
        expect(diffLineCounts('a', null)).toEqual({
            additions: 0,
            deletions: 1,
        });
    });
});
