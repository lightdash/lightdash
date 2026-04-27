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
            for (const stmt of splitSqlStatements(sql)) {
                await run(stmt);
            }
        },
        async close() {
            db.close();
        },
    };
}

// Split a multi-statement SQL blob on `;` and remove leading `--` comment
// lines from each chunk. Naive "filter out statements that start with --"
// would silently drop valid statements like
//   -- comment explaining the next DDL
//   DROP TABLE IF EXISTS foo;
// because the `--` line ends up prefixed to the DROP after the split. We
// keep the statement but peel off its leading comment lines.
function splitSqlStatements(sql: string): string[] {
    return sql
        .split(';')
        .map((s) =>
            s
                .split('\n')
                .filter((line) => !line.trim().startsWith('--'))
                .join('\n')
                .trim(),
        )
        .filter((s) => s.length > 0);
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
        // Force a single connection so one failed query can't leave a
        // sibling pool member in an aborted-transaction state that silently
        // cascades into "relation does not exist" errors on later tests.
        max: 1,
    });

    return {
        dialect: 'redshift',
        async execute(sql: string) {
            const result = await pool.query(sql);
            // Guard against unusual pg result shapes on Redshift: for some
            // queries `result.rows` comes back undefined rather than `[]`,
            // which crashes the comparator downstream with a useless
            // "Cannot read properties of undefined" error. Normalise to
            // an empty array so the caller sees a consistent shape.
            return (result as { rows?: Record<string, any>[] }).rows ?? [];
        },
        async seed(sql: string) {
            // Redshift's simple query protocol does not accept multiple
            // statements in a single `pool.query()` call the way Postgres
            // does — it fails without a useful error. Split on `;` and run
            // each statement individually, matching the Databricks /
            // ClickHouse approach.
            for (const stmt of splitSqlStatements(sql)) {
                await pool.query(stmt);
            }
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
            for (const stmt of splitSqlStatements(sql)) {
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
            for (const stmt of splitSqlStatements(sql)) {
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
            for (const stmt of splitSqlStatements(sql)) {
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

export async function createTrinoConnection(
    config: WarehouseConfig['trino'],
): Promise<WarehouseConnection> {
    const missing: string[] = [];
    if (!config.host) missing.push('FORMULA_TEST_TR_HOST');
    if (!config.port) missing.push('FORMULA_TEST_TR_PORT');
    if (!config.user) missing.push('FORMULA_TEST_TR_USER');
    if (!config.catalog) missing.push('FORMULA_TEST_TR_CATALOG');
    if (!config.schema) missing.push('FORMULA_TEST_TR_SCHEMA');
    if (missing.length > 0) {
        throw new Error(
            `Trino connection requires the following env vars: ${missing.join(', ')}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BasicAuth, Trino } = require('trino-client');

    const client = Trino.create({
        server: `${config.protocol}://${config.host}:${config.port}`,
        catalog: config.catalog,
        schema: config.schema,
        // trino-client treats `undefined` auth as no auth (anonymous).
        // Wire BasicAuth only when a password is set so a single-user dev
        // cluster (no auth) still works.
        ...(config.password
            ? { auth: new BasicAuth(config.user, config.password) }
            : { source: config.user }),
    });

    // The client returns an Iterator; drain it into an array of plain rows.
    // Trino's wire format is `{ columns, data }` with parallel column-name
    // and row arrays — convert each row to a record keyed by column name so
    // downstream comparators get the same shape as every other warehouse.
    const execute = async (
        sql: string,
    ): Promise<Record<string, any>[]> => {
        const iter = await client.query(sql);
        const out: Record<string, any>[] = [];
        let columns: string[] | undefined;
        // eslint-disable-next-line no-await-in-loop
        for await (const result of iter) {
            if (!columns && result.columns) {
                columns = result.columns.map(
                    (c: { name: string }) => c.name,
                );
            }
            if (result.error) {
                throw new Error(result.error.message);
            }
            const data: any[][] = result.data ?? [];
            for (const row of data) {
                const obj: Record<string, any> = {};
                (columns ?? []).forEach((name, i) => {
                    obj[name] = row[i];
                });
                out.push(obj);
            }
        }
        return out;
    };

    // `Trino.query()` accepts a single statement at a time — multi-
    // statement seed blobs need splitting, same as Databricks / ClickHouse
    // / Athena.
    return {
        dialect: 'trino',
        execute,
        async seed(sql: string) {
            for (const stmt of splitSqlStatements(sql)) {
                await execute(stmt);
            }
        },
        async close() {
            // trino-client has no explicit close — connections are per-query.
        },
    };
}

export async function createAthenaConnection(
    config: WarehouseConfig['athena'],
): Promise<WarehouseConnection> {
    const missing: string[] = [];
    if (!config.accessKeyId) missing.push('FORMULA_TEST_AT_ACCESS_KEY_ID');
    if (!config.secretAccessKey)
        missing.push('FORMULA_TEST_AT_SECRET_ACCESS_KEY');
    if (!config.region) missing.push('FORMULA_TEST_AT_REGION');
    if (!config.catalog) missing.push('FORMULA_TEST_AT_CATALOG');
    if (!config.database) missing.push('FORMULA_TEST_AT_DATABASE');
    if (!config.workgroup) missing.push('FORMULA_TEST_AT_WORKGROUP');
    if (!config.s3Bucket) missing.push('FORMULA_TEST_AT_S3_BUCKET');
    if (!config.s3Prefix) missing.push('FORMULA_TEST_AT_S3_PREFIX');
    if (!config.s3StagingDir) missing.push('FORMULA_TEST_AT_S3_STAGING_DIR');
    if (missing.length > 0) {
        throw new Error(
            `Athena connection requires the following env vars: ${missing.join(', ')}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
        AthenaClient,
        StartQueryExecutionCommand,
        GetQueryExecutionCommand,
        GetQueryResultsCommand,
    } = require('@aws-sdk/client-athena');

    const client = new AthenaClient({
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });

    // Iceberg seed paths use a `__ATHENA_TABLE_LOCATION__` placeholder —
    // substitute with the per-table S3 path before executing CREATE TABLE.
    const tableLocationBase = `s3://${config.s3Bucket}/${config.s3Prefix.replace(/\/$/, '')}/`;

    const startQuery = async (sql: string): Promise<string> => {
        const out = await client.send(
            new StartQueryExecutionCommand({
                QueryString: sql,
                QueryExecutionContext: {
                    Catalog: config.catalog,
                    Database: config.database,
                },
                WorkGroup: config.workgroup,
                // Always send OutputLocation so the runner works even when
                // the workgroup has no default output location configured.
                ResultConfiguration: {
                    OutputLocation: config.s3StagingDir,
                },
            }),
        );
        const id = out.QueryExecutionId as string | undefined;
        if (!id) throw new Error('Athena did not return a QueryExecutionId');
        return id;
    };

    const waitForQuery = async (id: string): Promise<void> => {
        // Athena queries are async: poll until SUCCEEDED / FAILED / CANCELLED.
        // 200ms backoff matches Lightdash's production AthenaWarehouseClient
        // poll interval.
        const POLL_INTERVAL_MS = 200;
        const MAX_POLL_ATTEMPTS = 1500; // 5 minutes upper bound
        for (let i = 0; i < MAX_POLL_ATTEMPTS; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const status = await client.send(
                new GetQueryExecutionCommand({ QueryExecutionId: id }),
            );
            const state = status.QueryExecution?.Status?.State;
            if (state === 'SUCCEEDED') return;
            if (state === 'FAILED' || state === 'CANCELLED') {
                const reason =
                    status.QueryExecution?.Status?.StateChangeReason ?? state;
                throw new Error(`Athena query ${state}: ${reason}`);
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => {
                setTimeout(r, POLL_INTERVAL_MS);
            });
        }
        throw new Error('Athena query timed out');
    };

    const fetchResults = async (
        id: string,
    ): Promise<Record<string, any>[]> => {
        // Page through GetQueryResults. The first row of the first page is
        // the column-name header per Athena's wire format — drop it.
        let nextToken: string | undefined;
        let columnNames: string[] | undefined;
        const out: Record<string, any>[] = [];
        let isFirstPage = true;
        do {
            // eslint-disable-next-line no-await-in-loop
            const page = await client.send(
                new GetQueryResultsCommand({
                    QueryExecutionId: id,
                    NextToken: nextToken,
                }),
            );
            const rows = page.ResultSet?.Rows ?? [];
            if (!columnNames) {
                columnNames =
                    page.ResultSet?.ResultSetMetadata?.ColumnInfo?.map(
                        (c: { Name: string }) => c.Name,
                    ) ?? [];
            }
            const startIdx = isFirstPage ? 1 : 0;
            const cols = columnNames ?? [];
            for (let i = startIdx; i < rows.length; i += 1) {
                const cells = rows[i].Data ?? [];
                const obj: Record<string, any> = {};
                cols.forEach((name, j) => {
                    obj[name] = cells[j]?.VarCharValue ?? null;
                });
                out.push(obj);
            }
            isFirstPage = false;
            nextToken = page.NextToken;
        } while (nextToken);
        return out;
    };

    const execute = async (
        sql: string,
    ): Promise<Record<string, any>[]> => {
        const id = await startQuery(sql);
        await waitForQuery(id);
        return fetchResults(id);
    };

    const executeWithoutResults = async (sql: string): Promise<void> => {
        const id = await startQuery(sql);
        await waitForQuery(id);
    };

    // CREATE DATABASE IF NOT EXISTS isn't a Glue catalog operation that
    // takes a `Database:` context (you can't ask Glue for the metadata of
    // a database that doesn't exist yet). Issue it without one.
    const ensureDatabase = async (): Promise<void> => {
        const out = await client.send(
            new StartQueryExecutionCommand({
                QueryString: `CREATE DATABASE IF NOT EXISTS ${config.database}`,
                QueryExecutionContext: { Catalog: config.catalog },
                WorkGroup: config.workgroup,
                ResultConfiguration: {
                    OutputLocation: config.s3StagingDir,
                },
            }),
        );
        const id = out.QueryExecutionId as string | undefined;
        if (!id) throw new Error('Athena did not return a QueryExecutionId');
        await waitForQuery(id);
    };

    return {
        dialect: 'athena',
        execute,
        async seed(sql: string) {
            await ensureDatabase();
            const substituted = sql.replaceAll(
                '__ATHENA_TABLE_LOCATION__',
                tableLocationBase,
            );
            for (const stmt of splitSqlStatements(substituted)) {
                // DDL/DML — no result rows to fetch.
                await executeWithoutResults(stmt);
            }
        },
        async close() {
            client.destroy();
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
        case 'athena':
            return createAthenaConnection(config.athena);
        case 'trino':
            return createTrinoConnection(config.trino);
        default: {
            const _exhaustive: never = warehouse;
            throw new Error(`Unknown warehouse: ${warehouse}`);
        }
    }
}
