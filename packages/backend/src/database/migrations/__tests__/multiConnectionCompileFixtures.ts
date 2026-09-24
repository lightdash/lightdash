import {
    DbtProjectType,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type DbtManifest,
} from '@lightdash/common';

export type FixtureModel = {
    name: string;
    database: string;
    table: string;
    label?: string;
};

export const postgresWarehouse = (
    dbname: string,
    port = Number(process.env.PGPORT ?? 5432),
): CreatePostgresCredentials => ({
    type: WarehouseTypes.POSTGRES,
    host: process.env.PGHOST ?? '127.0.0.1',
    port,
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? '',
    dbname,
    schema: 'public',
    sslmode: 'disable',
});

export const githubDbtConnection = (repository: string) => ({
    type: DbtProjectType.GITHUB as const,
    authorization_method: 'personal_access_token' as const,
    personal_access_token: 'token',
    repository,
    branch: 'main',
    project_sub_path: '/',
});

const modelNode = (packageName: string, model: FixtureModel) => ({
    unique_id: `model.${packageName}.${model.name}`,
    resource_type: 'model',
    name: model.name,
    alias: model.table,
    database: model.database,
    schema: 'public',
    package_name: packageName,
    path: `${model.name}.sql`,
    original_file_path: `models/${model.name}.sql`,
    fqn: [packageName, model.name],
    checksum: { name: 'sha256', checksum: model.name },
    config: { enabled: true, materialized: 'view', meta: {} },
    meta: model.label ? { label: model.label } : {},
    tags: [],
    description: '',
    columns: {
        id: {
            name: 'id',
            description: '',
            meta: { dimension: { type: 'number' } },
            data_type: null,
            tags: [],
        },
    },
    compiled: true,
    relation_name: `"${model.database}"."public"."${model.table}"`,
    depends_on: { macros: [], nodes: [] },
    patch_path: null,
    raw_code: `select * from ${model.table}`,
    compiled_code: `select * from ${model.table}`,
    language: 'sql',
    refs: [],
    sources: [],
    metrics: [],
    unrendered_config: {},
    created_at: 0,
    build_path: null,
    docs: { show: true },
    contract: { enforced: false },
});

export const dbtManifest = (
    packageName: string,
    models: FixtureModel[],
): DbtManifest =>
    ({
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v11.json',
            dbt_version: '1.7.0',
            generated_at: '2026-09-23T00:00:00.000000Z',
            adapter_type: 'postgres',
            project_name: packageName,
        },
        nodes: Object.fromEntries(
            models.map((model) => [
                `model.${packageName}.${model.name}`,
                modelNode(packageName, model),
            ]),
        ),
        sources: {},
        macros: {},
        docs: {},
        exposures: {},
        metrics: {},
        groups: {},
        selectors: {},
        disabled: {},
        parent_map: {},
        child_map: {},
        semantic_models: {},
        saved_queries: {},
    }) as unknown as DbtManifest;
