import {
    convertColumnMetric,
    convertModelMetric,
    convertToAiHints,
    flattenAiHints,
    getDbtManifestPackageNames,
    getEffectiveFieldAiHints,
    getExternalDbtNodeUniqueId,
    getExternalModelNodesFromManifest,
    getModelsFromManifest,
    isExternalDbtNode,
    patchPathParts,
    stripExternalDbtNodes,
    type DbtManifest,
} from './dbt';
import { DimensionType, MetricType } from './field';
import { TimeFrames } from './timeFrames';

describe('convertToAiHints', () => {
    it('normalizes strings and arrays of strings', () => {
        expect(convertToAiHints('Use the canonical value.')).toEqual([
            'Use the canonical value.',
        ]);
        expect(convertToAiHints(['First hint.', 'Second hint.'])).toEqual([
            'First hint.',
            'Second hint.',
        ]);
    });

    it('drops non-string values without discarding valid array entries', () => {
        expect(
            convertToAiHints([
                'Valid hint.',
                { Formula: 'clicks + keys' },
                null,
                42,
                false,
            ]),
        ).toEqual(['Valid hint.']);
        expect(convertToAiHints({ Formula: 'clicks + keys' })).toBeUndefined();
        expect(convertToAiHints(42)).toBeUndefined();
        expect(convertToAiHints(null)).toBeUndefined();
    });

    it('returns undefined when no usable hints remain', () => {
        expect(convertToAiHints('')).toBeUndefined();
        expect(convertToAiHints([])).toBeUndefined();
        expect(
            convertToAiHints([{ Formula: 'clicks + keys' }]),
        ).toBeUndefined();
    });

    it('flattens only validated hints', () => {
        expect(
            flattenAiHints(['First hint.', { invalid: true }, 'Second hint.']),
        ).toBe('First hint. Second hint.');
    });
});

describe('getEffectiveFieldAiHints', () => {
    it('combines field and group hints without changing their source metadata', () => {
        const field = {
            aiHint: ['Use as the canonical value.', 'Shared guidance.'],
            groups: ['settlements', 'missing'],
        };
        const table = {
            groupDetails: {
                settlements: {
                    label: 'Settlements',
                    aiHint: [
                        'Shared guidance.',
                        'Use for settlement questions.',
                    ],
                },
            },
        };

        expect(getEffectiveFieldAiHints(field, table)).toEqual([
            'Use as the canonical value.',
            'Shared guidance.',
            'Use for settlement questions.',
        ]);
        expect(field.aiHint).toEqual([
            'Use as the canonical value.',
            'Shared guidance.',
        ]);
    });

    it('ignores malformed field and group hints', () => {
        const field = {
            aiHint: [
                'Valid field hint.',
                { Formula: 'clicks + keys' },
            ] as unknown as string[],
            groups: ['settlements', 'broken'],
        };
        const table = {
            groupDetails: {
                settlements: {
                    label: 'Settlements',
                    aiHint: [
                        { invalid: true },
                        'Valid group hint.',
                    ] as unknown as string[],
                },
                broken: {
                    label: 'Broken',
                    aiHint: { invalid: true } as unknown as string[],
                },
            },
        };

        expect(getEffectiveFieldAiHints(field, table)).toEqual([
            'Valid field hint.',
            'Valid group hint.',
        ]);
    });
});

const makeManifest = (nodes: Record<string, object>): DbtManifest =>
    ({
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v12.json',
            generated_at: '2024-01-01T00:00:00Z',
            adapter_type: 'postgres',
        },
        nodes,
        sources: {},
        macros: {},
        docs: {},
        exposures: {},
        metrics: {},
    }) as unknown as DbtManifest;

const baseModel = {
    package_name: 'test',
    path: 'model.sql',
    original_file_path: 'models/model.sql',
    resource_type: 'model' as const,
    alias: 'model',
    checksum: { name: 'sha256', checksum: 'abc' },
    tags: [],
    refs: [],
    sources: [],
    depends_on: { macros: [], nodes: [] },
    database: 'db',
    schema: 'public',
    fqn: ['test', 'model'],
    raw_code: 'SELECT 1',
    columns: {},
    meta: {},
    description: '',
    created_at: 0,
    language: 'sql',
    relation_name: '"db"."public"."model"',
};

describe('getModelsFromManifest', () => {
    it('should include models with config.materialized set to table', () => {
        const manifest = makeManifest({
            'model.test.table_model': {
                ...baseModel,
                unique_id: 'model.test.table_model',
                name: 'table_model',
                config: { materialized: 'table' },
            },
        });

        const models = getModelsFromManifest(manifest);
        expect(models).toHaveLength(1);
        expect(models[0].unique_id).toBe('model.test.table_model');
    });

    it('should include models with config.materialized set to view', () => {
        const manifest = makeManifest({
            'model.test.view_model': {
                ...baseModel,
                unique_id: 'model.test.view_model',
                name: 'view_model',
                config: { materialized: 'view' },
            },
        });

        const models = getModelsFromManifest(manifest);
        expect(models).toHaveLength(1);
        expect(models[0].unique_id).toBe('model.test.view_model');
    });

    it('should include models without config.materialized (default materialization)', () => {
        const manifest = makeManifest({
            'model.test.default_model': {
                ...baseModel,
                unique_id: 'model.test.default_model',
                name: 'default_model',
                config: {},
            },
        });

        const models = getModelsFromManifest(manifest);
        expect(models).toHaveLength(1);
        expect(models[0].unique_id).toBe('model.test.default_model');
    });

    it('should filter out ephemeral models', () => {
        const manifest = makeManifest({
            'model.test.table_model': {
                ...baseModel,
                unique_id: 'model.test.table_model',
                name: 'table_model',
                config: { materialized: 'table' },
            },
            'model.test.ephemeral_model': {
                ...baseModel,
                unique_id: 'model.test.ephemeral_model',
                name: 'ephemeral_model',
                config: { materialized: 'ephemeral' },
            },
        });

        const models = getModelsFromManifest(manifest);
        expect(models).toHaveLength(1);
        expect(models[0].unique_id).toBe('model.test.table_model');
    });

    it('should filter out non-model nodes', () => {
        const manifest = makeManifest({
            'model.test.real_model': {
                ...baseModel,
                unique_id: 'model.test.real_model',
                name: 'real_model',
                config: { materialized: 'table' },
            },
            'test.test.some_test': {
                ...baseModel,
                unique_id: 'test.test.some_test',
                name: 'some_test',
                resource_type: 'test',
                config: { materialized: 'table' },
            },
        });

        const models = getModelsFromManifest(manifest);
        expect(models).toHaveLength(1);
        expect(models[0].unique_id).toBe('model.test.real_model');
    });

    it('should include a mix of tables, views, and models without materialized while excluding ephemeral', () => {
        const manifest = makeManifest({
            'model.test.table_model': {
                ...baseModel,
                unique_id: 'model.test.table_model',
                name: 'table_model',
                config: { materialized: 'table' },
            },
            'model.test.view_model': {
                ...baseModel,
                unique_id: 'model.test.view_model',
                name: 'view_model',
                config: { materialized: 'view' },
            },
            'model.test.no_mat_model': {
                ...baseModel,
                unique_id: 'model.test.no_mat_model',
                name: 'no_mat_model',
                config: {},
            },
            'model.test.ephemeral_model': {
                ...baseModel,
                unique_id: 'model.test.ephemeral_model',
                name: 'ephemeral_model',
                config: { materialized: 'ephemeral' },
            },
        });

        const models = getModelsFromManifest(manifest);
        const ids = models.map((m) => m.unique_id).sort();
        expect(ids).toEqual([
            'model.test.no_mat_model',
            'model.test.table_model',
            'model.test.view_model',
        ]);
    });

    it('should include seed nodes alongside models', () => {
        const manifest = makeManifest({
            'model.test.my_model': {
                ...baseModel,
                unique_id: 'model.test.my_model',
                name: 'my_model',
                config: { materialized: 'table' },
            },
            'seed.test.raw_plan': {
                ...baseModel,
                unique_id: 'seed.test.raw_plan',
                name: 'raw_plan',
                resource_type: 'seed',
                config: { materialized: 'seed' },
            },
        });

        const models = getModelsFromManifest(manifest);
        expect(models).toHaveLength(2);
        const ids = models.map((m) => m.unique_id).sort();
        expect(ids).toEqual(['model.test.my_model', 'seed.test.raw_plan']);
    });
});

describe('convertColumnMetric — baseDimensionType plumbing', () => {
    const base = {
        modelName: 'orders',
        dimensionName: 'order_date',
        dimensionSql: '${TABLE}.order_date',
        tableLabel: 'Orders',
    };

    it('sets baseDimensionType/Interval for a MIN/MAX that aggregates its own DATE column', () => {
        const metric = convertColumnMetric({
            ...base,
            name: 'max_order_date',
            metric: { type: MetricType.MAX },
            dimensionType: DimensionType.DATE,
            dimensionTimeInterval: TimeFrames.DAY,
        });
        expect(metric.baseDimensionType).toEqual(DimensionType.DATE);
        expect(metric.baseDimensionTimeInterval).toEqual(TimeFrames.DAY);
    });

    it('sets it when an explicit sql equals the column it is declared under', () => {
        // A `sql` equal to the column it aggregates is still a calendar DATE base.
        const metric = convertColumnMetric({
            ...base,
            name: 'max_order_date_explicit',
            metric: { type: MetricType.MAX, sql: '${TABLE}.order_date' },
            dimensionType: DimensionType.DATE,
            dimensionTimeInterval: TimeFrames.DAY,
        });
        expect(metric.baseDimensionType).toEqual(DimensionType.DATE);
        expect(metric.baseDimensionTimeInterval).toEqual(TimeFrames.DAY);
    });

    it('does NOT set it when the metric overrides sql to aggregate a different column', () => {
        // Declared under order_date (DATE) but actually MAX(id), so the column
        // type must not be inferred as the base.
        const metric = convertColumnMetric({
            ...base,
            name: 'max_id',
            metric: { type: MetricType.MAX, sql: '${TABLE}.id' },
            dimensionType: DimensionType.DATE,
            dimensionTimeInterval: TimeFrames.DAY,
        });
        expect(metric.baseDimensionType).toBeUndefined();
        expect(metric.baseDimensionTimeInterval).toBeUndefined();
    });

    it('does NOT set it for a non MIN/MAX metric', () => {
        const metric = convertColumnMetric({
            ...base,
            name: 'count_order_date',
            metric: { type: MetricType.COUNT },
            dimensionType: DimensionType.DATE,
            dimensionTimeInterval: TimeFrames.DAY,
        });
        expect(metric.baseDimensionType).toBeUndefined();
    });

    it('does NOT set it for a non-temporal base (e.g. MAX over a number)', () => {
        const metric = convertColumnMetric({
            ...base,
            dimensionName: 'amount',
            dimensionSql: '${TABLE}.amount',
            name: 'max_amount',
            metric: { type: MetricType.MAX },
            dimensionType: DimensionType.NUMBER,
        });
        expect(metric.baseDimensionType).toBeUndefined();
    });

    it('records a TIMESTAMP base for a MIN/MAX over its own TIMESTAMP column', () => {
        const metric = convertColumnMetric({
            ...base,
            dimensionName: 'created_at',
            dimensionSql: '${TABLE}.created_at',
            name: 'min_created_at',
            metric: { type: MetricType.MIN },
            dimensionType: DimensionType.TIMESTAMP,
        });
        expect(metric.baseDimensionType).toEqual(DimensionType.TIMESTAMP);
        expect(metric.baseDimensionTimeInterval).toBeUndefined();
    });
});

describe('convertModelMetric — base type plumbing', () => {
    it('leaves the base type undefined for a model-level metric (translator never passes one)', () => {
        // Model-level metrics call convertModelMetric directly with no base
        // dimension argument, so they never carry a base type.
        const metric = convertModelMetric({
            modelName: 'orders',
            name: 'max_created_at',
            metric: { type: MetricType.MAX, sql: '${TABLE}.created_at' },
            tableLabel: 'Orders',
        });
        expect(metric.baseDimensionType).toBeUndefined();
        expect(metric.baseDimensionTimeInterval).toBeUndefined();
    });
});

describe('patchPathParts', () => {
    it('parses the dbt-core format with project prefix', () => {
        expect(
            patchPathParts('dbt_artifacts://models/dim_current_models.yml'),
        ).toEqual({
            project: 'dbt_artifacts',
            path: 'models/dim_current_models.yml',
        });
    });

    it('parses dbt-core paths with nested directories', () => {
        expect(
            patchPathParts('my_project://models/sources/exposures.yml'),
        ).toEqual({
            project: 'my_project',
            path: 'models/sources/exposures.yml',
        });
    });

    it('parses the dbt-fusion format (no project prefix)', () => {
        expect(patchPathParts('models/dim_current_models.yml')).toEqual({
            project: null,
            path: 'models/dim_current_models.yml',
        });
    });

    it('normalizes Windows backslashes from dbt-fusion on Windows', () => {
        expect(patchPathParts('models\\dim_current_models.yml')).toEqual({
            project: null,
            path: 'models/dim_current_models.yml',
        });
        expect(patchPathParts('models\\sources\\exposures.yml')).toEqual({
            project: null,
            path: 'models/sources/exposures.yml',
        });
    });

    it('preserves additional :// occurrences after the project separator', () => {
        expect(patchPathParts('my_project://models/weird://name.yml')).toEqual({
            project: 'my_project',
            path: 'models/weird://name.yml',
        });
    });
});

describe('external dbt model nodes', () => {
    const stub = {
        ...baseModel,
        name: 'external',
        unique_id: 'model.shared.external',
        path: '',
        original_file_path: '',
    };
    const local = {
        ...baseModel,
        name: 'local',
        unique_id: 'model.test.local',
        depends_on: { nodes: [stub.unique_id], macros: [] },
    };
    const manifest = makeManifest({
        [stub.unique_id]: stub,
        [local.unique_id]: local,
    });

    it('recognizes only nodes with both paths empty as external', () => {
        expect(isExternalDbtNode(stub)).toBe(true);
        expect(isExternalDbtNode({ ...stub, path: 'model.sql' })).toBe(false);
        expect(
            isExternalDbtNode({
                ...stub,
                original_file_path: 'models/model.sql',
            }),
        ).toBe(false);
        expect(
            getModelsFromManifest(manifest).map((node) => node.unique_id),
        ).toEqual([local.unique_id]);
    });
    it('exports real models and retains dependencies on local and injected models with relation and version fields', () => {
        const ephemeral = {
            ...local,
            name: 'ephemeral',
            alias: undefined,
            version: 2,
            latest_version: 3,
            access: 'public',
            config: { materialized: 'ephemeral' },
            depends_on: {
                nodes: [local.unique_id, 'seed.test.raw', stub.unique_id],
                macros: [],
            },
        };
        const nodes = getExternalModelNodesFromManifest(
            makeManifest({
                stub,
                local,
                ephemeral,
                seed: {
                    ...local,
                    name: 'raw',
                    unique_id: 'seed.test.raw',
                    resource_type: 'seed',
                },
            }),
        );
        expect(nodes).toEqual([
            {
                name: 'local',
                package_name: 'test',
                identifier: 'model',
                schema: 'public',
                database: 'db',
                relation_name: baseModel.relation_name,
                version: null,
                latest_version: null,
                access: null,
                depends_on_nodes: [stub.unique_id],
            },
            {
                name: 'ephemeral',
                package_name: 'test',
                identifier: 'ephemeral',
                schema: 'public',
                database: 'db',
                relation_name: baseModel.relation_name,
                version: 2,
                latest_version: 3,
                access: 'public',
                depends_on_nodes: [
                    local.unique_id,
                    'seed.test.raw',
                    stub.unique_id,
                ],
            },
            {
                resource_type: 'seed',
                name: 'raw',
                package_name: 'test',
                identifier: 'model',
                schema: 'public',
                database: 'db',
                relation_name: baseModel.relation_name,
                version: null,
                latest_version: null,
                access: null,
                depends_on_nodes: [stub.unique_id],
            },
        ]);
        expect(
            getExternalModelNodesFromManifest(
                makeManifest({
                    minimal: {
                        ...local,
                        database: undefined,
                        relation_name: undefined,
                        depends_on: undefined,
                    },
                }),
            )[0],
        ).toMatchObject({
            database: null,
            relation_name: null,
            depends_on_nodes: [],
        });
    });
    it('retains native seed and snapshot identities and explicit access from config', () => {
        const nodes = getExternalModelNodesFromManifest(
            makeManifest({
                seed: {
                    ...local,
                    name: 'lookup',
                    unique_id: 'seed.test.lookup',
                    resource_type: 'seed',
                    config: { materialized: 'seed', access: 'public' },
                },
                snapshot: {
                    ...local,
                    name: 'history',
                    unique_id: 'snapshot.test.history',
                    resource_type: 'snapshot',
                    config: { materialized: 'snapshot', access: 'public' },
                    depends_on: { nodes: ['seed.test.lookup'], macros: [] },
                },
                protectedSnapshot: {
                    ...local,
                    name: 'internal_history',
                    unique_id: 'snapshot.test.internal_history',
                    resource_type: 'snapshot',
                },
                externalSeed: { ...stub, resource_type: 'seed' },
                externalSnapshot: { ...stub, resource_type: 'snapshot' },
            }),
        );
        expect(nodes.map(getExternalDbtNodeUniqueId)).toEqual([
            'seed.test.lookup',
            'snapshot.test.history',
            'snapshot.test.internal_history',
        ]);
        expect(nodes.map((node) => node.access)).toEqual([
            'public',
            'public',
            null,
        ]);
        expect(nodes[1].depends_on_nodes).toEqual(['seed.test.lookup']);
        expect(
            getExternalDbtNodeUniqueId({
                ...nodes[0],
                resource_type: undefined,
                version: 0,
            }),
        ).toBe('model.test.lookup.v0');
    });
    it('strips stubs without changing dependencies or mutating the input', () => {
        const stripped = stripExternalDbtNodes(manifest);
        expect(stripped.nodes).toEqual({ [local.unique_id]: local });
        expect(manifest.nodes).toHaveProperty(stub.unique_id);
        expect(local.depends_on.nodes).toEqual([stub.unique_id]);
    });
    it('includes the metadata project name and distinct model packages', () => {
        expect(
            getDbtManifestPackageNames({
                ...manifest,
                metadata: { ...manifest.metadata, project_name: 'analytics' },
            }),
        ).toEqual(['analytics', 'test']);
        expect(
            getDbtManifestPackageNames({
                ...manifest,
                metadata: { ...manifest.metadata, project_name: 'test' },
            }),
        ).toEqual(['test']);
    });
    it('includes every non-external model package without metadata.project_name', () => {
        expect(
            getDbtManifestPackageNames(
                makeManifest({
                    root: local,
                    first: { ...local, package_name: 'dependency' },
                    second: {
                        ...local,
                        name: 'second',
                        package_name: 'dependency',
                    },
                    stub: { ...stub, package_name: 'upstream' },
                    seed: {
                        ...local,
                        resource_type: 'seed',
                        package_name: 'seed_package',
                    },
                    test: {
                        ...local,
                        resource_type: 'test',
                        package_name: 'test_package',
                    },
                }),
            ),
        ).toEqual(['test', 'dependency']);
    });
    it('returns an empty list without metadata.project_name or non-external models', () => {
        expect(getDbtManifestPackageNames(makeManifest({}))).toEqual([]);
        expect(
            getDbtManifestPackageNames(
                makeManifest({
                    stub,
                    seed: { ...local, resource_type: 'seed' },
                }),
            ),
        ).toEqual([]);
    });
});
