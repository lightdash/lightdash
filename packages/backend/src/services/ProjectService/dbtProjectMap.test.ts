import { type DbtManifest } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { describeDbtProjectMap } from './dbtProjectMap';

const model = (pkg: string, file: string, properties: string | null) => ({
    unique_id: `model.${pkg}.${file}`,
    resource_type: 'model',
    package_name: pkg,
    name: file,
    original_file_path: file,
    patch_path: properties && `${pkg}://${properties}`,
});

const source = (sourceName: string, table: string) => ({
    unique_id: `source.shop.${sourceName}.${table}`,
    resource_type: 'source',
    package_name: 'shop',
    source_name: sourceName,
    name: table,
    database: 'raw',
    schema: 'events',
    original_file_path: 'models/staging/_sources.yml',
});

const manifest = (overrides: Partial<DbtManifest> = {}): DbtManifest =>
    ({
        metadata: {
            dbt_schema_version: '',
            generated_at: '',
            adapter_type: 'postgres',
            project_name: 'shop',
        },
        nodes: Object.fromEntries(
            [
                model(
                    'shop',
                    'models/staging/stg_orders.sql',
                    'models/staging/stg_orders.yml',
                ),
                model('shop', 'models/staging/stg_customers.sql', null),
                model(
                    'shop',
                    'models/marts/orders.sql',
                    'models/marts/_marts.yml',
                ),
                model('dbt_utils', 'models/x.sql', null),
            ].map((node) => [node.unique_id, node]),
        ),
        sources: Object.fromEntries(
            ['orders', 'customers', 'payments', 'refunds'].map((table) => {
                const node = source('app', table);
                return [node.unique_id, node];
            }),
        ),
        macros: {
            'macro.dbt.a': { package_name: 'dbt' },
            'macro.dbt_postgres.a': { package_name: 'dbt_postgres' },
            'macro.dbt_date.a': { package_name: 'dbt_date' },
        },
        metrics: {},
        docs: {},
        ...overrides,
    }) as DbtManifest;

describe('describeDbtProjectMap', () => {
    it('lists sources, model folders and packages', () => {
        expect(describeDbtProjectMap(manifest())).toBe(
            [
                'dbt project shop, as its last compile saw it. Files added since then are not listed.',
                '',
                'Sources, with where they live and where they are declared:',
                '- app in raw.events, declared in models/staging/_sources.yml: 4 tables, such as customers, orders, payments',
                '',
                'Model folders, with one example each:',
                '- models/marts: 1 model, such as models/marts/orders.sql with properties in models/marts/_marts.yml',
                '- models/staging: 2 models, such as models/staging/stg_customers.sql',
                '',
                'Installed packages: dbt_date, dbt_utils',
            ].join('\n'),
        );
    });

    it('caps long lists', () => {
        const nodes = Object.fromEntries(
            Array.from({ length: 45 }, (_, i) => {
                const node = model('shop', `models/f${i}/m.sql`, null);
                return [node.unique_id, node];
            }),
        );
        const map = describeDbtProjectMap(
            manifest({ nodes: nodes as DbtManifest['nodes'] }),
        );
        expect(map).toContain('- and 5 more');
        expect(map?.match(/^- models\/f/gm)).toHaveLength(40);
    });

    it('is null without a project name', () => {
        const base = manifest();
        expect(
            describeDbtProjectMap({
                ...base,
                metadata: { ...base.metadata, project_name: '' },
            }),
        ).toBeNull();
    });
});
