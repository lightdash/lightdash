export type WarehouseType =
    | 'postgres'
    | 'redshift'
    | 'bigquery'
    | 'snowflake'
    | 'duckdb'
    | 'databricks';

export const ALL_WAREHOUSES: WarehouseType[] = [
    'duckdb',
    'postgres',
    'redshift',
    'bigquery',
    'snowflake',
    'databricks',
];

export type Tier = 'fast' | 'tier1' | 'tier2' | 'all';

// Redshift runs in tier1 alongside Postgres: it shares the formula-package
// codegen with Postgres (empty subclass — zero overrides), so a tier1 run
// catches shared-path regressions without waiting for cloud-warehouse tiers.
// Databricks runs in tier2 alongside BigQuery and Snowflake: it's a
// cloud-warehouse with higher connection latency and shared infrastructure
// cost considerations.
export const TIER_WAREHOUSES: Record<Tier, WarehouseType[]> = {
    fast: ['duckdb'],
    tier1: ['duckdb', 'postgres', 'redshift'],
    tier2: ['bigquery', 'snowflake', 'databricks'],
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
    };
}
