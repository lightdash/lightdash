import { type AnyType, type DbtManifest } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    findModelsToCompile,
    findNewCompileErrors,
    patchManifest,
} from './dbtManifestPatch';

const model = (name: string, extra: Record<string, unknown> = {}) => ({
    unique_id: `model.shop.${name}`,
    resource_type: 'model',
    name,
    package_name: 'shop',
    patch_path: 'shop://models/schema.yml',
    description: '',
    meta: {},
    columns: {},
    ...extra,
});

const manifestOf = (...nodes: ReturnType<typeof model>[]): DbtManifest => ({
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json',
        generated_at: '',
        adapter_type: 'postgres',
        project_name: 'shop',
    },
    nodes: Object.fromEntries(nodes.map((node) => [node.unique_id, node])),
    metrics: {},
    docs: {},
});

const base = `version: 2
models:
  - name: orders
    description: '{{ doc("orders") }}'
    columns:
      # the order's amount
      - name: amount
        config:
          meta:
            metrics:
              total_amount:
                type: sum
`;

const orders = () =>
    model('orders', {
        description: 'Orders, rendered from a doc block',
        // required_attributes comes from +meta in dbt_project.yml, not the YAML.
        meta: { required_attributes: { is_staff: 'true' } },
        columns: {
            amount: {
                name: 'amount',
                description: '',
                meta: { metrics: { total_amount: { type: 'sum' } } },
                data_type: 'number',
            },
        },
    });

const patch = (next: string, manifest = manifestOf(orders())) =>
    patchManifest(manifest, [{ path: 'models/schema.yml', base, next }]);

const patched = (result: ReturnType<typeof patchManifest>) => {
    if (result.status !== 'patched') throw new Error(result.reason);
    return result;
};

describe('patchManifest', () => {
    it('adds a column metric and keeps meta set outside the YAML', () => {
        const result = patched(
            patch(
                base.replace(
                    '                type: sum\n',
                    '                type: sum\n              max_amount:\n                type: max\n',
                ),
            ),
        );
        const node = result.manifest.nodes['model.shop.orders'];
        expect(result.changedModels).toEqual(['orders']);
        expect(node).toMatchObject({
            description: 'Orders, rendered from a doc block',
            meta: { required_attributes: { is_staff: 'true' } },
            columns: {
                amount: {
                    data_type: 'number',
                    meta: {
                        metrics: {
                            total_amount: { type: 'sum' },
                            max_amount: { type: 'max' },
                        },
                    },
                },
            },
        });
    });

    it('merges model meta key by key and drops a key the YAML removes', () => {
        const before = `${base}    meta:\n      label: Orders\n      spotlight:\n        visibility: show\n`;
        const after = `${base}    meta:\n      label: All orders\n`;
        const result = patched(
            patchManifest(
                manifestOf(
                    model('orders', {
                        meta: {
                            required_attributes: { is_staff: 'true' },
                            label: 'Orders',
                            spotlight: { visibility: 'show' },
                        },
                    }),
                ),
                [{ path: 'models/schema.yml', base: before, next: after }],
            ),
        );
        expect(result.manifest.nodes['model.shop.orders']).toMatchObject({
            meta: {
                required_attributes: { is_staff: 'true' },
                label: 'All orders',
            },
        });
        expect(result.manifest.nodes['model.shop.orders']).not.toHaveProperty(
            'meta.spotlight',
        );
    });

    it('adds a new column', () => {
        const result = patched(
            patch(
                `${base}      - name: status\n        description: Order status\n`,
            ),
        );
        expect(result.manifest.nodes['model.shop.orders']).toMatchObject({
            columns: {
                status: { name: 'status', description: 'Order status' },
            },
        });
    });

    it.each([
        [
            'adds Jinja',
            base.replace(
                'type: sum',
                'type: sum\n                sql: "{{ var(\'x\') }}"',
            ),
        ],
        [
            'changes config other than meta',
            base.replace(
                '    columns:',
                '    config:\n      materialized: table\n    columns:',
            ),
        ],
        ['removes a model', 'version: 2\nmodels: []\n'],
        [
            'describes a model that does not exist',
            `${base}  - name: refunds\n    description: Refunds\n`,
        ],
        ['adds MetricFlow YAML', `${base}semantic_models:\n  - name: orders\n`],
    ])('refuses a change that %s', (_label, next) => {
        expect(patch(next).status).toBe('unsupported');
    });

    it('refuses files only dbt can read', () => {
        expect(
            patchManifest(manifestOf(orders()), [
                {
                    path: 'models/orders.sql',
                    base: 'select 1',
                    next: 'select 2',
                },
            ]),
        ).toEqual({
            status: 'unsupported',
            reason: 'models/orders.sql needs dbt to parse',
        });
        expect(
            patchManifest(manifestOf(orders()), [
                {
                    path: 'dbt_project.yml',
                    base: 'name: shop',
                    next: 'name: x',
                },
            ]).status,
        ).toBe('unsupported');
    });

    it('leaves a manifest alone when nothing changed', () => {
        const result = patched(patch(base));
        expect(result.changedModels).toEqual([]);
        expect(result.manifest.nodes['model.shop.orders']).toEqual(orders());
    });
});

describe('findModelsToCompile', () => {
    it('compiles changed models, those that join them, and what those join', () => {
        const manifest = manifestOf(
            model('orders', { meta: { joins: [{ join: 'customers' }] } }),
            model('customers'),
            model('payments', { meta: { joins: [{ join: 'orders' }] } }),
            model('unrelated'),
        );
        expect(findModelsToCompile(manifest, ['customers'])).toEqual({
            reached: ['customers', 'orders'],
            uniqueIds: ['model.shop.orders', 'model.shop.customers'],
        });
    });
});

describe('findNewCompileErrors', () => {
    const explore = (name: string, warnings: string[] = []): AnyType => ({
        name,
        tables: {},
        ...(warnings.length > 0
            ? {
                  warnings: warnings.map((message) => ({
                      type: 'FIELD_ERROR',
                      message,
                  })),
              }
            : {}),
    });
    const broken = (name: string, message: string): AnyType => ({
        name,
        label: name,
        groupLabel: undefined,
        groups: [],
        errors: [{ type: 'METADATA_PARSE_ERROR', message }],
    });

    it('counts a field a partial compile dropped, but not one already dropped', () => {
        expect(
            findNewCompileErrors(
                [explore('orders', ['old warning', 'bad metric'])],
                { orders: explore('orders', ['old warning']) },
            ),
        ).toEqual(['bad metric (in orders)']);
    });

    it('says an error repeated across explores once', () => {
        expect(
            findNewCompileErrors(
                [
                    explore('orders', ['bad metric']),
                    explore('payments', ['bad metric']),
                ],
                {},
            ),
        ).toEqual(['bad metric (in orders, payments)']);
    });

    it('counts an explore that stops compiling, but not one already broken', () => {
        expect(
            findNewCompileErrors(
                [
                    broken('orders', 'no such join'),
                    broken('legacy', 'still broken'),
                ],
                {
                    orders: explore('orders'),
                    legacy: broken('legacy', 'broken'),
                },
            ),
        ).toEqual(['no such join (in orders)']);
    });
});
