import {
    convertExplores,
    DbtManifestVersion,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    getModelsFromManifest,
    ManifestValidator,
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
            original_file_path: 'models/orders.sql',
            root_path: '/workspace/test',
            fqn: ['test', 'orders'],
            alias: 'orders',
            checksum: { name: 'sha256', checksum: 'abc123' },
            patch_path: 'test://models/orders.yml',
            description: 'Orders',
            tags: ['finance'],
            config: {
                materialized: 'table',
                meta: {
                    label: 'Orders',
                    metrics: {
                        order_count: {
                            type: 'count',
                            label: 'Order count',
                        },
                    },
                },
                unneeded: 'drop me',
            },
            meta: { label: 'Legacy orders' },
            columns: {
                order_id: {
                    name: 'order_id',
                    description: 'Order identifier',
                    meta: {
                        dimension: {
                            primary_key: false,
                            label: 'Legacy order identifier',
                        },
                    },
                    data_type: DimensionType.NUMBER,
                    config: {
                        meta: {
                            dimension: { primary_key: true },
                            additional_dimensions: {
                                order_id_plus_one: {
                                    type: DimensionType.NUMBER,
                                    label: 'Order ID plus one',
                                    sql: '${TABLE}.order_id + 1',
                                },
                            },
                        },
                    },
                    timestamp_domain: 'naive',
                    quote: true,
                },
            },
            compiled: true,
            depends_on: { nodes: [], macros: [] },
            lightdash_source_name: 'primary',
            unrendered_config: { meta: { hidden: true } },
            raw_code: 'select 1',
            language: 'sql',
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
    test.each(Object.values(DbtManifestVersion))(
        'keeps every model field required by CLI validation for %s',
        (manifestVersion) => {
            const modelValidator = ManifestValidator.getValidator(
                `https://schemas.lightdash.com/lightdash/${manifestVersion}.json#/definitions/LightdashCompiledModelNode`,
            );
            const modelSchemaReference = (
                modelValidator.schema as {
                    allOf?: { $ref?: string }[];
                }
            ).allOf?.find(({ $ref }) => $ref?.includes('/manifest/'))?.$ref;
            const modelSchema = modelSchemaReference
                ? (ManifestValidator.getValidator(modelSchemaReference)
                      .schema as {
                      properties?: Record<string, unknown>;
                      required?: string[];
                  })
                : undefined;
            const requiredFields = modelSchema?.required ?? [];
            const manifestForVersion = structuredClone(manifest);
            manifestForVersion.metadata.dbt_schema_version = `https://schemas.getdbt.com/dbt/manifest/${manifestVersion}.json`;
            const sourceModel = manifestForVersion.nodes[
                'model.test.orders'
            ] as unknown as Record<string, unknown>;
            if (modelSchema?.properties) {
                const schemaFields = new Set(
                    Object.keys(modelSchema.properties),
                );
                manifestForVersion.nodes['model.test.orders'] =
                    Object.fromEntries(
                        Object.entries(sourceModel).filter(
                            ([field]) =>
                                schemaFields.has(field) ||
                                field === 'lightdash_source_name',
                        ),
                    ) as DbtManifest['nodes'][string];
            }
            const projectedModels = getModelsFromManifest(
                projectMergedManifest(manifestForVersion),
            ).filter(({ resource_type: resourceType }) =>
                ['model'].includes(resourceType),
            );

            projectedModels.forEach((model) => {
                requiredFields.forEach((requiredField) => {
                    expect(model).toHaveProperty(requiredField);
                });
                const modelToValidate = { ...model } as typeof model & {
                    lightdash_source_name?: unknown;
                };
                delete modelToValidate.lightdash_source_name;
                expect(
                    ManifestValidator.isValid(modelValidator, modelToValidate),
                ).toEqual([true, undefined]);
            });
        },
    );

    test('drops model dead weight while preserving compiler semantics', async () => {
        const manifestBeforeProjection = structuredClone(manifest);
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
            original_file_path: 'models/orders.sql',
            root_path: '/workspace/test',
            fqn: ['test', 'orders'],
            alias: 'orders',
            checksum: { name: 'sha256', checksum: 'abc123' },
            patch_path: 'test://models/orders.yml',
            description: 'Orders',
            tags: ['finance'],
            config: {
                materialized: 'table',
                unneeded: 'drop me',
            },
            meta: {
                label: 'Orders',
                metrics: {
                    order_count: {
                        type: 'count',
                        label: 'Order count',
                    },
                },
            },
            columns: {
                order_id: {
                    name: 'order_id',
                    description: 'Order identifier',
                    meta: {
                        dimension: {
                            primary_key: true,
                            label: 'Legacy order identifier',
                        },
                        additional_dimensions: {
                            order_id_plus_one: {
                                type: DimensionType.NUMBER,
                                label: 'Order ID plus one',
                                sql: '${TABLE}.order_id + 1',
                            },
                        },
                    },
                    data_type: DimensionType.NUMBER,
                    timestamp_domain: 'naive',
                },
            },
            compiled: true,
            raw_code: 'select 1',
            language: 'sql',
            depends_on: { nodes: [], macros: [] },
            lightdash_source_name: 'primary',
        });
        expect(projectedColumn).not.toHaveProperty('config');
        expect(projected.nodes['test.test.orders_not_null']).toEqual(
            manifest.nodes['test.test.orders_not_null'],
        );
        expect(projected.metrics).toEqual(manifest.metrics);
        expect(manifest).toEqual(manifestBeforeProjection);

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
