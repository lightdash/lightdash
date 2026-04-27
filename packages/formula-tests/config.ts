export type WarehouseType =
    | 'postgres'
    | 'redshift'
    | 'bigquery'
    | 'snowflake'
    | 'duckdb'
    | 'databricks'
    | 'clickhouse'
    | 'athena';

export const ALL_WAREHOUSES: WarehouseType[] = [
    'duckdb',
    'postgres',
    'redshift',
    'bigquery',
    'snowflake',
    'databricks',
    'clickhouse',
    'athena',
];

export type Tier = 'fast' | 'tier1' | 'tier2' | 'all';

// Redshift runs in tier1 alongside Postgres: it shares the formula-package
// codegen with Postgres (empty subclass — zero overrides), so a tier1 run
// catches shared-path regressions without waiting for cloud-warehouse tiers.
// Databricks, ClickHouse, Athena run in tier2 alongside BigQuery and
// Snowflake: cloud / self-hosted warehouses with their own connection
// latency and infrastructure considerations.
export const TIER_WAREHOUSES: Record<Tier, WarehouseType[]> = {
    fast: ['duckdb'],
    tier1: ['duckdb', 'postgres', 'redshift'],
    tier2: [
        'bigquery',
        'snowflake',
        'databricks',
        'clickhouse',
        'athena',
    ],
    all: ALL_WAREHOUSES,
};

export interface WarehouseConfig {
    postgres: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
    };
    redshift: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
    };
    bigquery: {
        projectId: string;
        dataset: string;
        keyFilename: string;
        useADC: boolean;
    };
    snowflake: {
        account: string;
        username: string;
        password: string;
        database: string;
        schema: string;
        warehouse: string;
    };
    duckdb: Record<string, never>; // In-process, no config needed
    databricks: {
        serverHostname: string;
        httpPath: string;
        token: string;
        catalog: string;
        schema: string;
    };
    clickhouse: {
        url: string;
        username: string;
        password: string;
        database: string;
    };
    athena: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        // Athena catalog. Defaults to `AwsDataCatalog` (the Glue catalog).
        // Surfaced for cross-account or Lake Formation setups that use a
        // non-default catalog name.
        catalog: string;
        // The Glue database tables are created in. Equivalent to Lightdash
        // project YAML's `schema:` for an Athena adapter.
        database: string;
        // Workgroup ('primary' is the AWS default). The workgroup must have
        // Engine v3 enabled (Trino-based) and a result-output S3 location
        // configured — Athena rejects every query without one.
        workgroup: string;
        // S3 prefix where Iceberg table data lives. Each table seeds into
        // `s3://<bucket>/<prefix>/<table>/`. Distinct from the staging
        // location below, which holds query result metadata only — though
        // both can point at the same bucket with different prefixes.
        s3Bucket: string;
        s3Prefix: string;
        // S3 location where Athena writes query results / metadata. Passed
        // as `ResultConfiguration.OutputLocation` on every query so the
        // runner doesn't depend on the workgroup having a default output
        // location pre-configured. Format: `s3://bucket/path/`.
        s3StagingDir: string;
    };
}

export function getWarehouseConfig(): WarehouseConfig {
    return {
        postgres: {
            host: process.env.FORMULA_TEST_PG_HOST ?? 'localhost',
            port: parseInt(process.env.FORMULA_TEST_PG_PORT ?? '5432', 10),
            database: process.env.FORMULA_TEST_PG_DATABASE ?? 'formula_tests',
            user: process.env.FORMULA_TEST_PG_USER ?? 'postgres',
            password: process.env.FORMULA_TEST_PG_PASSWORD ?? 'password',
        },
        redshift: {
            host: process.env.FORMULA_TEST_RS_HOST ?? '',
            port: parseInt(process.env.FORMULA_TEST_RS_PORT ?? '5439', 10),
            database: process.env.FORMULA_TEST_RS_DATABASE ?? 'formula_tests',
            user: process.env.FORMULA_TEST_RS_USER ?? '',
            password: process.env.FORMULA_TEST_RS_PASSWORD ?? '',
        },
        bigquery: {
            projectId: process.env.FORMULA_TEST_BQ_PROJECT ?? '',
            dataset: process.env.FORMULA_TEST_BQ_DATASET ?? 'formula_tests',
            keyFilename: process.env.FORMULA_TEST_BQ_KEYFILE ?? '',
            useADC: process.env.FORMULA_TEST_BQ_USE_ADC === 'true',
        },
        snowflake: {
            account: process.env.FORMULA_TEST_SF_ACCOUNT ?? '',
            username: process.env.FORMULA_TEST_SF_USERNAME ?? '',
            password: process.env.FORMULA_TEST_SF_PASSWORD ?? '',
            database: process.env.FORMULA_TEST_SF_DATABASE ?? '',
            schema: process.env.FORMULA_TEST_SF_SCHEMA ?? 'FORMULA_TESTS',
            warehouse: process.env.FORMULA_TEST_SF_WAREHOUSE ?? '',
        },
        duckdb: {},
        databricks: {
            serverHostname: process.env.FORMULA_TEST_DB_HOSTNAME ?? '',
            httpPath: process.env.FORMULA_TEST_DB_HTTP_PATH ?? '',
            token: process.env.FORMULA_TEST_DB_TOKEN ?? '',
            catalog: process.env.FORMULA_TEST_DB_CATALOG ?? '',
            schema: process.env.FORMULA_TEST_DB_SCHEMA ?? 'formula_tests',
        },
        clickhouse: {
            url: process.env.FORMULA_TEST_CH_URL ?? 'http://localhost:8123',
            username: process.env.FORMULA_TEST_CH_USERNAME ?? 'default',
            password: process.env.FORMULA_TEST_CH_PASSWORD ?? '',
            database: process.env.FORMULA_TEST_CH_DATABASE ?? 'formula_tests',
        },
        athena: {
            accessKeyId: process.env.FORMULA_TEST_AT_ACCESS_KEY_ID ?? '',
            secretAccessKey:
                process.env.FORMULA_TEST_AT_SECRET_ACCESS_KEY ?? '',
            region: process.env.FORMULA_TEST_AT_REGION ?? '',
            catalog: process.env.FORMULA_TEST_AT_CATALOG ?? '',
            database: process.env.FORMULA_TEST_AT_DATABASE ?? '',
            workgroup: process.env.FORMULA_TEST_AT_WORKGROUP ?? '',
            s3Bucket: process.env.FORMULA_TEST_AT_S3_BUCKET ?? '',
            s3Prefix: process.env.FORMULA_TEST_AT_S3_PREFIX ?? '',
            s3StagingDir: process.env.FORMULA_TEST_AT_S3_STAGING_DIR ?? '',
        },
    };
}
