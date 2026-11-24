import { DbtSchemaEditor, getErrorMessage } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    diffLineCounts,
    runCodeMode,
    unifiedDiff,
    unifiedDiffs,
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
    it('stops a script that hands the host too much data', async () => {
        const result = await run(
            "const big = 'x'.repeat(5 * 1024 * 1024); for (let i = 0; i < 5; i++) repo.write('models/b' + i + '.sql', big);",
        );
        expect(result.error).toMatch(/too much data/);
    });

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

    describe('libraries', () => {
        const libraries = {
            layer: {
                fields: {
                    description: 'Find fields by name.\nMore detail.',
                    schema: async () => ({ type: 'object' }),
                    run: async (args: unknown) =>
                        `fields for ${JSON.stringify(args)}`,
                },
            },
        };

        it('calls a library function and lists them with help', async () => {
            const { logs, error } = await runCodeMode(
                `console.log(layer.fields({ q: 'amount' })); console.log(help()); console.log(help('layer.fields'));`,
                repoOf({}),
                { libraries },
            );
            expect(error).toBeNull();
            expect(logs).toEqual([
                'fields for {"q":"amount"}',
                'layer.fields: Find fields by name.',
                'Find fields by name.\nMore detail.\nArguments (JSON schema): {"type":"object"}',
            ]);
        });

        it('turns a failed call into an error the script can catch', async () => {
            const { logs } = await runCodeMode(
                `try { failing.call({}) } catch (e) { console.log(e.message) }`,
                repoOf({}),
                {
                    libraries: {
                        failing: {
                            call: {
                                description: '',
                                schema: async () => ({}),
                                run: async () => {
                                    throw new Error('no access');
                                },
                            },
                        },
                    },
                },
            );
            expect(logs).toEqual(['no access']);
        });

        it('refuses a library that would replace a built-in', async () => {
            await expect(
                runCodeMode('', repoOf({}), {
                    libraries: { repo: libraries.layer },
                }),
            ).rejects.toThrow('repo cannot be a library name');
        });
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

describe('unifiedDiff', () => {
    const lines = (count: number) =>
        Array.from({ length: count }, (_, index) => `line ${index + 1}`);

    it('shows each change with three lines of context, in separate hunks when far apart', () => {
        const before = `${lines(20).join('\n')}\n`;
        const after = `${lines(20)
            .map((line, index) => (index === 1 ? 'changed' : line))
            .join('\n')}\nadded\n`;
        expect(unifiedDiff({ path: 'models/a.yml', before, after })).toBe(
            [
                '--- a/models/a.yml',
                '+++ b/models/a.yml',
                '@@ -1,5 +1,5 @@',
                ' line 1',
                '-line 2',
                '+changed',
                ' line 3',
                ' line 4',
                ' line 5',
                '@@ -18,3 +18,4 @@',
                ' line 18',
                ' line 19',
                ' line 20',
                '+added',
                '',
            ].join('\n'),
        );
    });

    it('diffs a new file and a deleted one by the same path', () => {
        expect(
            unifiedDiff({ path: 'models/b.sql', before: null, after: 'x\n' }),
        ).toBe('--- /dev/null\n+++ b/models/b.sql\n@@ -0,0 +1,1 @@\n+x\n');
        expect(
            unifiedDiff({ path: 'models/b.sql', before: 'x\n', after: null }),
        ).toBe('--- a/models/b.sql\n+++ b/models/b.sql\n@@ -1,1 +0,0 @@\n-x\n');
    });

    it('is null when nothing changed', () => {
        expect(
            unifiedDiff({ path: 'a.yml', before: 'a\n', after: 'a\n' }),
        ).toBe(null);
    });

    it('leaves out a file whose changed region is too large to compare', () => {
        const before = lines(1500).join('\n');
        const after = lines(1500)
            .map((line) => `${line} changed`)
            .join('\n');
        expect(unifiedDiff({ path: 'a.yml', before, after })).toBe(null);
        expect(
            unifiedDiffs([
                { path: 'a.yml', before, after },
                { path: 'b.yml', before: 'a\n', after: 'b\n' },
            ]),
        ).toEqual(['--- a/b.yml\n+++ b/b.yml\n@@ -1,1 +1,1 @@\n-a\n+b\n']);
    });
});
