import { WarehouseTypes } from '@lightdash/common';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'vitest';
import { ApiClient, Body } from './api-client';

export const BIGQUERY_CREDENTIALS_PATH = path.resolve(
    __dirname,
    '../../e2e/cypress/fixtures/credentials.json',
);

/**
 * The BigQuery staging dataset (`e2e_jaffle_shop`) holds the same jaffle +
 * `timezone_test` rows as the local Postgres seed, so warehouse-parity tests
 * can assert the same expected counts against it.
 */
export function bigqueryWarehouseConfig(): Record<string, unknown> {
    const keyfileContents = JSON.parse(
        fs.readFileSync(BIGQUERY_CREDENTIALS_PATH, 'utf-8'),
    );
    return {
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
        keyfileContents,
        type: WarehouseTypes.BIGQUERY,
    };
}

/**
 * True when a BigQuery service-account keyfile is available. CI writes the
 * `GCP_CREDENTIALS` secret to this path; locally it is usually absent, so
 * BigQuery-only suites should `describe.skipIf(!hasBigqueryCredentials())`.
 */
export function hasBigqueryCredentials(): boolean {
    if (!fs.existsSync(BIGQUERY_CREDENTIALS_PATH)) return false;
    try {
        const creds = JSON.parse(
            fs.readFileSync(BIGQUERY_CREDENTIALS_PATH, 'utf-8'),
        ) as { private_key?: string };
        return Boolean(creds.private_key);
    } catch {
        return false;
    }
}

/**
 * Warehouse connection builders + availability predicates, shared across
 * warehouse-parity suites. Each builder targets the jaffle dataset that mirrors
 * the local Postgres seed, so the same queries assert the same expectations
 * across dialects. Predicates report whether the matching credentials are
 * present (CI provides them; locally most are absent, so suites should skip).
 */
export function postgresWarehouseConfig(): Record<string, unknown> {
    return {
        host: process.env.PGHOST || 'db-dev',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'password',
        dbname: process.env.PGDATABASE || 'postgres',
        schema: 'jaffle',
        port: Number(process.env.PGPORT) || 5432,
        sslmode: 'disable',
        type: WarehouseTypes.POSTGRES,
    };
}

export function hasSnowflakeCredentials(): boolean {
    return Boolean(
        process.env.SNOWFLAKE_ACCOUNT &&
        process.env.SNOWFLAKE_USER &&
        process.env.SNOWFLAKE_PASSWORD,
    );
}

export function snowflakeWarehouseConfig(): Record<string, unknown> {
    return {
        account: process.env.SNOWFLAKE_ACCOUNT,
        user: process.env.SNOWFLAKE_USER,
        password: process.env.SNOWFLAKE_PASSWORD,
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'JAFFLE',
        type: WarehouseTypes.SNOWFLAKE,
    };
}

export function hasDatabricksCredentials(): boolean {
    return Boolean(
        process.env.DATABRICKS_HOST &&
        process.env.DATABRICKS_PATH &&
        process.env.DATABRICKS_TOKEN,
    );
}

export function databricksWarehouseConfig(): Record<string, unknown> {
    return {
        type: WarehouseTypes.DATABRICKS,
        serverHostName: process.env.DATABRICKS_HOST,
        httpPath: process.env.DATABRICKS_PATH,
        personalAccessToken: process.env.DATABRICKS_TOKEN,
        database: 'jaffle',
    };
}

export function hasTrinoCredentials(): boolean {
    return Boolean(
        process.env.TRINO_HOST &&
        process.env.TRINO_PORT &&
        process.env.TRINO_USER &&
        process.env.TRINO_PASSWORD,
    );
}

export function trinoWarehouseConfig(): Record<string, unknown> {
    return {
        type: WarehouseTypes.TRINO,
        host: process.env.TRINO_HOST,
        port: Number(process.env.TRINO_PORT),
        user: process.env.TRINO_USER,
        password: process.env.TRINO_PASSWORD,
        dbname: 'staging_postgres_trino',
        schema: 'jaffle',
        http_scheme: 'https',
    };
}

export type WarehouseTestEntry = {
    name: string;
    config: Record<string, unknown>;
};

/**
 * The warehouses whose credentials are currently available, ready to drive a
 * parameterized suite. Postgres is always included (seeded locally) unless
 * `includePostgres: false` — pass that when a suite already covers Postgres via
 * the seed project.
 */
export function getAvailableWarehouseConfigs(
    options: { includePostgres?: boolean } = {},
): WarehouseTestEntry[] {
    const { includePostgres = true } = options;
    const entries: WarehouseTestEntry[] = [];
    if (includePostgres) {
        entries.push({ name: 'postgres', config: postgresWarehouseConfig() });
    }
    if (hasSnowflakeCredentials()) {
        entries.push({ name: 'snowflake', config: snowflakeWarehouseConfig() });
    }
    if (hasBigqueryCredentials()) {
        entries.push({ name: 'bigquery', config: bigqueryWarehouseConfig() });
    }
    if (hasDatabricksCredentials()) {
        entries.push({
            name: 'databricks',
            config: databricksWarehouseConfig(),
        });
    }
    if (hasTrinoCredentials()) {
        entries.push({ name: 'trino', config: trinoWarehouseConfig() });
    }
    return entries;
}

export async function createProject(
    client: ApiClient,
    projectName: string,
    warehouseConnection: Record<string, unknown>,
): Promise<string> {
    const resp = await client.post<{
        results: { project: { projectUuid: string } };
    }>('/api/v1/org/projects', {
        name: projectName,
        type: 'DEFAULT',
        dbtConnection: {
            target: '',
            environment: [],
            type: 'dbt',
            project_dir: process.env.DBT_PROJECT_DIR || '/usr/app/dbt',
        },
        dbtVersion: 'v1.7',
        warehouseConnection,
    });
    expect(resp.status).toBe(200);
    return resp.body.results.project.projectUuid;
}

async function waitForV1JobCompletion(
    client: ApiClient,
    jobUuid: string,
    maxRetries = 300,
): Promise<'DONE' | 'ERROR' | 'TIMEOUT'> {
    for (let i = 0; i < maxRetries; i++) {
        const resp = await client.get<
            Body<{ jobStatus: 'STARTED' | 'RUNNING' | 'DONE' | 'ERROR' }>
        >(`/api/v1/jobs/${jobUuid}`);
        const { jobStatus } = resp.body.results;
        if (jobStatus === 'ERROR') return 'ERROR';
        if (jobStatus === 'DONE') return 'DONE';
        await new Promise((r) => setTimeout(r, 1000));
    }
    return 'TIMEOUT';
}

/**
 * All test-created projects point at the same server-side dbt directory, so
 * concurrent refreshes race on `dbt deps` and fail. This lock serializes
 * refreshes across vitest forks and concurrent tests; mkdir is atomic on the
 * shared runner filesystem. Stale locks (crashed fork) are stolen after 8 min.
 */
const REFRESH_LOCK_DIR = path.join(
    os.tmpdir(),
    'lightdash-api-tests-refresh.lock',
);
const REFRESH_LOCK_STALE_MS = 8 * 60 * 1000;

async function acquireRefreshLock(): Promise<void> {
    for (;;) {
        try {
            fs.mkdirSync(REFRESH_LOCK_DIR);
            return;
        } catch {
            try {
                const age = Date.now() - fs.statSync(REFRESH_LOCK_DIR).mtimeMs;
                if (age > REFRESH_LOCK_STALE_MS) {
                    fs.rmdirSync(REFRESH_LOCK_DIR);
                }
            } catch {
                // released or stolen between checks; retry below
            }
            await new Promise<void>((r) => {
                setTimeout(r, 500);
            });
        }
    }
}

function releaseRefreshLock(): void {
    try {
        fs.rmdirSync(REFRESH_LOCK_DIR);
    } catch {
        // already stolen as stale
    }
}

export async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    await acquireRefreshLock();
    try {
        return await fn();
    } finally {
        releaseRefreshLock();
    }
}

/**
 * Create a project, run a full refresh, and return its UUID once compiled.
 * Throws if the refresh job fails so callers fail loudly instead of querying
 * an empty project.
 */
export async function createAndRefreshProject(
    client: ApiClient,
    projectName: string,
    warehouseConnection: Record<string, unknown>,
): Promise<string> {
    const projectUuid = await createProject(
        client,
        projectName,
        warehouseConnection,
    );

    const { outcome, jobUuid } = await withRefreshLock(async () => {
        const refreshResp = await client.post<Body<{ jobUuid: string }>>(
            `/api/v1/projects/${projectUuid}/refresh`,
        );
        expect(refreshResp.status).toBe(200);

        const id = refreshResp.body.results.jobUuid;
        return {
            outcome: await waitForV1JobCompletion(client, id),
            jobUuid: id,
        };
    });
    if (outcome === 'ERROR') {
        const jobResp = await client.get<
            Body<{ steps: { stepError?: string }[] }>
        >(`/api/v1/jobs/${jobUuid}`);
        const stepErrors = jobResp.body.results.steps
            .map((step) => step.stepError)
            .filter(Boolean)
            .join('; ');
        throw new Error(
            `Project refresh errored for "${projectName}" (job ${jobUuid}): ${stepErrors}`,
        );
    }
    if (outcome === 'TIMEOUT') {
        throw new Error(
            `Project refresh timed out for "${projectName}" (job ${jobUuid} still running after poll window)`,
        );
    }
    return projectUuid;
}

export async function deleteProjectsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<
        Body<{ projectUuid: string; name: string }[]>
    >('/api/v1/org/projects');
    expect(resp.status).toBe(200);
    for (const project of resp.body.results) {
        if (names.includes(project.name)) {
            await client.delete(`/api/v1/org/projects/${project.projectUuid}`);
        }
    }
}
