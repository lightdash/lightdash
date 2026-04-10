import { getModelsFromManifest, patchPathParts, type DbtManifest } from './dbt';

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
