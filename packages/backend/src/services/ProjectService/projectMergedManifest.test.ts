import {
    convertExplores,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    getModelsFromManifest,
    SupportedDbtAdapter,
    type DbtManifest,
} from '@lightdash/common';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { projectMergedManifest } from './projectMergedManifest';

const manifest = {
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json',
        generated_at: '2026-08-16T00:00:00.000Z',
        adapter_type: SupportedDbtAdapter.POSTGRES,
    },
    nodes: {
        'model.test.orders': {
            unique_id: 'model.test.orders',
            name: 'orders',
            database: 'analytics',
            schema: 'public',
            relation_name: '"analytics"."public"."orders"',
            resource_type: 'model',
            package_name: 'test',
            path: 'orders.sql',
            patch_path: 'test://models/orders.yml',
            description: 'Orders',
            tags: ['finance'],
            config: {
                materialized: 'table',
                meta: { label: 'Orders' },
                unneeded: 'drop me',
            },
            meta: { label: 'Orders' },
            columns: {
                order_id: {
                    name: 'order_id',
                    description: 'Order identifier',
                    meta: { dimension: { primary_key: true } },
                    data_type: DimensionType.NUMBER,
                    config: {
                        meta: { dimension: { primary_key: true } },
                    },
                    timestamp_domain: 'naive',
                    quote: true,
                },
            },
            compiled: true,
            depends_on: { nodes: [], macros: [] },
            unrendered_config: { meta: { hidden: true } },
            raw_code: 'select 1',
            compiled_code: 'select 1',
        },
        'test.test.orders_not_null': {
            unique_id: 'test.test.orders_not_null',
            name: 'orders_not_null',
            resource_type: 'test',
            depends_on: { nodes: ['model.test.orders'], macros: [] },
            test_metadata: { name: 'not_null' },
        },
    },
    metrics: {
        order_count: { name: 'order_count', type: 'simple' },
    },
    docs: {},
    sources: {},
    macros: {},
    semantic_models: {},
} as unknown as DbtManifest;

describe('projectMergedManifest', () => {
    test('drops model dead weight while preserving compiler semantics', async () => {
        const projected = projectMergedManifest(manifest);
        const projectedModel = projected.nodes['model.test.orders'] as Record<
            string,
            unknown
        >;
        const projectedColumn = (
            projectedModel.columns as Record<string, Record<string, unknown>>
        ).order_id;

        expect(projectedModel).toEqual({
            unique_id: 'model.test.orders',
            name: 'orders',
            database: 'analytics',
            schema: 'public',
            relation_name: '"analytics"."public"."orders"',
            resource_type: 'model',
            package_name: 'test',
            path: 'orders.sql',
            patch_path: 'test://models/orders.yml',
            description: 'Orders',
            tags: ['finance'],
            config: {
                materialized: 'table',
                unneeded: 'drop me',
            },
            meta: { label: 'Orders' },
            columns: {
                order_id: {
                    name: 'order_id',
                    description: 'Order identifier',
                    meta: { dimension: { primary_key: true } },
                    data_type: DimensionType.NUMBER,
                    timestamp_domain: 'naive',
                },
            },
            compiled: true,
            depends_on: { nodes: [], macros: [] },
        });
        expect(projectedColumn).not.toHaveProperty('config');
        expect(projected.nodes['test.test.orders_not_null']).toEqual(
            manifest.nodes['test.test.orders_not_null'],
        );
        expect(projected.metrics).toEqual(manifest.metrics);

        const compile = (source: DbtManifest) =>
            convertExplores(
                getModelsFromManifest(source),
                false,
                SupportedDbtAdapter.POSTGRES,
                warehouseClientMock,
                { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            );

        await expect(compile(projected)).resolves.toEqual(
            await compile(manifest),
        );
    });

    test('drops top-level sections the merge does not carry', () => {
        const manifestWithExtraSections = {
            ...manifest,
            exposures: { 'exposure.test.orders': { name: 'orders' } },
            parent_map: { 'model.test.orders': [] },
            child_map: { 'model.test.orders': [] },
            selectors: {},
            disabled: {},
        } as unknown as DbtManifest;

        const serialized = JSON.parse(
            JSON.stringify(projectMergedManifest(manifestWithExtraSections)),
        ) as Record<string, unknown>;

        expect(Object.keys(serialized).sort()).toEqual([
            'docs',
            'macros',
            'metadata',
            'metrics',
            'nodes',
            'semantic_models',
            'sources',
        ]);
    });

    test('keeps optional sections absent when the merge omits them', () => {
        const manifestWithoutOptionalSections = { ...manifest } as Record<
            string,
            unknown
        >;
        delete manifestWithoutOptionalSections.sources;
        delete manifestWithoutOptionalSections.macros;
        delete manifestWithoutOptionalSections.semantic_models;

        const serialized = JSON.parse(
            JSON.stringify(
                projectMergedManifest(
                    manifestWithoutOptionalSections as unknown as DbtManifest,
                ),
            ),
        ) as Record<string, unknown>;

        expect(Object.keys(serialized).sort()).toEqual([
            'docs',
            'metadata',
            'metrics',
            'nodes',
        ]);
    });
});
