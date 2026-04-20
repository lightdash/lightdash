import type { WarehouseType, WarehouseConfig } from '../config';

export interface WarehouseConnection {
    dialect: WarehouseType;
    execute(sql: string): Promise<Record<string, any>[]>;
    seed(sql: string): Promise<void>;
    close(): Promise<void>;
}

export async function createDuckDBConnection(): Promise<WarehouseConnection> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const duckdb = require('duckdb');
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();

    const execute = (sql: string): Promise<Record<string, any>[]> =>
        new Promise((resolve, reject) => {
            conn.all(sql, (err: Error | null, rows: Record<string, any>[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

    const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
            conn.run(sql, (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });

    return {
        dialect: 'duckdb',
        execute,
        async seed(sql: string) {
            // Split on semicolons and execute each statement
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !s.startsWith('--'));
            for (const stmt of statements) {
                await run(stmt);
            }
        },
        async close() {
            db.close();
        },
    };
}

export async function createPostgresConnection(
    config: WarehouseConfig['postgres'],
): Promise<WarehouseConnection> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
    });

    return {
        dialect: 'postgres',
        async execute(sql: string) {
            const result = await pool.query(sql);
            return result.rows;
        },
        async seed(sql: string) {
            await pool.query(sql);
        },
        async close() {
            await pool.end();
        },
    };
}

export async function createRedshiftConnection(
    config: WarehouseConfig['redshift'],
): Promise<WarehouseConnection> {
    // Redshift is Postgres-wire-compatible, so `pg` works as the client.
    // Redshift Serverless (and provisioned clusters in their default
    // configuration) require TLS; without this the server rejects the
    // connection with "no pg_hba.conf entry for host … SSL off".
    // `rejectUnauthorized: false` keeps the channel encrypted while
    // tolerating self-signed / corporate-MITM CA chains — acceptable for
    // a test harness connecting to our own cluster.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: { rejectUnauthorized: false },
    });

    return {
        dialect: 'redshift',
        async execute(sql: string) {
            const result = await pool.query(sql);
            return result.rows;
        },
        async seed(sql: string) {
            await pool.query(sql);
        },
        async close() {
            await pool.end();
        },
    };
}

export async function createDatabricksConnection(
    config: WarehouseConfig['databricks'],
): Promise<WarehouseConnection> {
    // Fail loudly here rather than letting the underlying client produce a
    // cryptic "Invalid URL" when env vars aren't set.
    const missing: string[] = [];
    if (!config.serverHostname) missing.push('FORMULA_TEST_DB_HOSTNAME');
    if (!config.httpPath) missing.push('FORMULA_TEST_DB_HTTP_PATH');
    if (!config.token) missing.push('FORMULA_TEST_DB_TOKEN');
    if (!config.catalog) missing.push('FORMULA_TEST_DB_CATALOG');
    if (missing.length > 0) {
        throw new Error(
            `Databricks connection requires the following env vars: ${missing.join(', ')}`,
        );
    }

    // Normalise the hostname: strip any protocol prefix and trailing slashes
    // so users can copy-paste the full workspace URL from the browser without
    // hitting a cryptic "Invalid URL" / doubled-protocol error from the SDK.
    const host = config.serverHostname
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DBSQLClient } = require('@databricks/sql');
    const client = new DBSQLClient();
    await client.connect({
        host,
        path: config.httpPath,
        token: config.token,
    });
    const session = await client.openSession({
        initialCatalog: config.catalog,
        initialSchema: config.schema,
    });

    const execute = async (sql: string): Promise<Record<string, any>[]> => {
        const operation = await session.executeStatement(sql, {
            runAsync: true,
        });
        try {
            const rows = await operation.fetchAll();
            return rows as Record<string, any>[];
        } finally {
            await operation.close();
        }
    };

    return {
        dialect: 'databricks',
        async execute(sql: string) {
            return execute(sql);
        },
        async seed(sql: string) {
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !s.startsWith('--'));
            for (const stmt of statements) {
                await execute(stmt);
            }
        },
        async close() {
            await session.close();
            await client.close();
        },
    };
}

export async function createClickhouseConnection(
    config: WarehouseConfig['clickhouse'],
): Promise<WarehouseConnection> {
    if (!config.url) {
        throw new Error(
            'ClickHouse connection requires FORMULA_TEST_CH_URL (e.g. http://localhost:8123 or https://<instance>.clickhouse.cloud:8443)',
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require('@clickhouse/client');
    const client = createClient({
        url: config.url,
        username: config.username,
        password: config.password,
        database: config.database,
        // ClickHouse Cloud auto-suspends idle services. First query can take
        // 15-30s to cold-start compute, which exceeds the default timeout
        // and manifests as a generic "Timeout error" at seed time.
        request_timeout: 120_000,
    });

    // Warm up the service before we try to seed. This lets the cold-start
    // wait happen in a single short query rather than inside a multi-
    // statement seed where the timeout is harder to reason about.
    await client.command({ query: 'SELECT 1' });

    const execute = async (sql: string): Promise<Record<string, any>[]> => {
        const result = await client.query({
            query: sql,
            format: 'JSONEachRow',
        });
        return (await result.json()) as Record<string, any>[];
    };

    return {
        dialect: 'clickhouse',
        async execute(sql: string) {
            return execute(sql);
        },
        async seed(sql: string) {
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !s.startsWith('--'));
            for (const stmt of statements) {
                // Seed uses DDL/DML that doesn't return rows — use `command`
                // so the client doesn't try to stream a result set.
                await client.command({ query: stmt });
            }
        },
        async close() {
            await client.close();
        },
    };
}

export async function createBigQueryConnection(
    config: WarehouseConfig['bigquery'],
): Promise<WarehouseConnection> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BigQuery } = require('@google-cloud/bigquery');

    const clientOptions: Record<string, unknown> = {
        projectId: config.projectId,
    };
    if (config.useADC) {
        // Application Default Credentials — no keyfile needed
    } else if (config.keyFilename) {
        clientOptions.keyFilename = config.keyFilename;
    }

    const client = new BigQuery(clientOptions);
    const dataset = config.dataset;

    const defaultDataset = {
        projectId: config.projectId,
        datasetId: dataset,
    };

    return {
        dialect: 'bigquery',
        async execute(sql: string) {
            const [rows] = await client.query({ query: sql, defaultDataset });
            return rows;
        },
        async seed(sql: string) {
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !s.startsWith('--'));
            for (const stmt of statements) {
                await client.query({ query: stmt, defaultDataset });
            }
            // BigQuery CREATE TABLE needs a moment before tables are queryable
            await new Promise((resolve) => { setTimeout(resolve, 5000); });
        },
        async close() {
            // BigQuery client doesn't require explicit close
        },
    };
}

export async function createConnection(
    warehouse: WarehouseType,
    config: WarehouseConfig,
): Promise<WarehouseConnection> {
    switch (warehouse) {
        case 'duckdb':
            return createDuckDBConnection();
        case 'postgres':
            return createPostgresConnection(config.postgres);
        case 'redshift':
            return createRedshiftConnection(config.redshift);
        case 'bigquery':
            return createBigQueryConnection(config.bigquery);
        case 'snowflake':
            throw new Error('Snowflake connection not yet implemented');
        case 'databricks':
            return createDatabricksConnection(config.databricks);
        case 'clickhouse':
            return createClickhouseConnection(config.clickhouse);
        default: {
            const _exhaustive: never = warehouse;
            throw new Error(`Unknown warehouse: ${warehouse}`);
        }
    }
}
