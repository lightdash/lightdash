import {
    ChartKind,
    CreateSqlChart,
    SEED_PROJECT,
    UpdateSqlChart,
    WarehouseTypes,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, SITE_URL } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { waitForJobCompletion } from '../helpers/polling';

const apiUrl = '/api/v1';

/**
 * Create a project via the API and return its UUID.
 */
async function createProject(
    client: ApiClient,
    projectName: string,
    warehouseConfig: Record<string, unknown>,
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
        warehouseConnection: warehouseConfig,
    });
    expect(resp.status).toBe(200);
    return resp.body.results.project.projectUuid;
}

/**
 * Delete projects by name.
 */
async function deleteProjectsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<{
        results: { projectUuid: string; name: string }[];
    }>('/api/v1/org/projects');
    expect(resp.status).toBe(200);
    for (const project of resp.body.results) {
        if (names.includes(project.name)) {
            await client.delete(`/api/v1/org/projects/${project.projectUuid}`);
        }
    }
}

/**
 * Poll a job status until completed or error.
 */
async function pollJobStatus(
    client: ApiClient,
    jobId: string,
    maxRetries = 20,
    interval = 500,
): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
        await new Promise((r) => setTimeout(r, interval));
        const resp = await client.get<any>(
            `${apiUrl}/schedulers/job/${jobId}/status`,
        );
        expect(resp.status).toBe(200);
        const { status } = resp.body.results;
        if (status === 'completed' || status === 'error') {
            return resp.body.results;
        }
    }
    throw new Error(
        `Reached max retries (${maxRetries}) without job completion`,
    );
}

// Postgres warehouse config using environment variables
const postgresConfig = {
    host: process.env.PGHOST || 'db-dev',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'password',
    dbname: 'postgres',
    schema: 'jaffle',
    port: 5432,
    sslmode: 'disable',
    type: WarehouseTypes.POSTGRES,
};

const warehouseEntries: [string, Record<string, unknown>][] = [
    ['postgres', postgresConfig],
];

// Add snowflake if env vars are set
if (
    process.env.SNOWFLAKE_ACCOUNT &&
    process.env.SNOWFLAKE_USER &&
    process.env.SNOWFLAKE_PASSWORD
) {
    warehouseEntries.push([
        'snowflake',
        {
            account: process.env.SNOWFLAKE_ACCOUNT,
            user: process.env.SNOWFLAKE_USER,
            password: process.env.SNOWFLAKE_PASSWORD,
            role: 'SYSADMIN',
            database: 'SNOWFLAKE_DATABASE_STAGING',
            warehouse: 'TESTING',
            schema: 'JAFFLE',
            type: WarehouseTypes.SNOWFLAKE,
        },
    ]);
}

function getDatabaseDetails(
    warehouseConfig: Record<string, unknown>,
): [string, string] {
    switch (warehouseConfig.type) {
        case WarehouseTypes.DATABRICKS:
            return [
                (warehouseConfig.catalog as string) || '',
                warehouseConfig.database as string,
            ];
        case WarehouseTypes.SNOWFLAKE:
            return [
                warehouseConfig.database as string,
                warehouseConfig.schema as string,
            ];
        case WarehouseTypes.BIGQUERY:
            return [
                warehouseConfig.project as string,
                warehouseConfig.dataset as string,
            ];
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.POSTGRES:
            return [
                warehouseConfig.dbname as string,
                warehouseConfig.schema as string,
            ];
        default:
            return ['unknown', 'unknown'];
    }
}

for (const [warehouseName, warehouseConfig] of warehouseEntries) {
    describe(`Get tables and fields for SQL runner on ${warehouseName}`, () => {
        const projectName = `SqlRunner ${warehouseName} ${Date.now()}`;
        let projectUuid: string;
        let admin: ApiClient;

        beforeAll(async () => {
            admin = await login();
            projectUuid = await createProject(
                admin,
                projectName,
                warehouseConfig,
            );
        });

        afterAll(async () => {
            await deleteProjectsByName(admin, [projectName]);
        });

        it(`Get tables for SQL runner ${warehouseName}`, async () => {
            const resp = await admin.get<any>(
                `${apiUrl}/projects/${projectUuid}/sqlRunner/tables`,
            );
            expect(resp.status).toBe(200);

            const [database, schema] = getDatabaseDetails(warehouseConfig);

            expect(Object.keys(resp.body.results)).toContain(database);
            expect(Object.keys(resp.body.results[database])).toContain(schema);

            if (warehouseConfig.type === WarehouseTypes.SNOWFLAKE) {
                for (const table of ['CUSTOMERS', 'ORDERS', 'PAYMENTS']) {
                    expect(
                        Object.keys(resp.body.results[database][schema]),
                    ).toContain(table);
                }
                expect(
                    Object.keys(resp.body.results[database][schema].ORDERS),
                ).toEqual([]);
            } else {
                for (const table of ['customers', 'orders', 'payments']) {
                    expect(
                        Object.keys(resp.body.results[database][schema]),
                    ).toContain(table);
                }
                expect(
                    Object.keys(resp.body.results[database][schema].orders),
                ).toEqual([]);
            }
        });

        it(`Get fields for SQL runner ${warehouseName}`, async () => {
            const tableName =
                warehouseConfig.type === WarehouseTypes.SNOWFLAKE
                    ? 'ORDERS'
                    : 'orders';
            const [, schema] = getDatabaseDetails(warehouseConfig);
            const resp = await admin.get<any>(
                `${apiUrl}/projects/${projectUuid}/sqlRunner/fields?tableName=${tableName}&schemaName=${schema}`,
            );
            expect(resp.status).toBe(200);

            const { results } = resp.body;

            expect(Object.keys(results).length).toBeGreaterThan(5);

            if (warehouseConfig.type === WarehouseTypes.SNOWFLAKE) {
                for (const field of ['ORDER_ID', 'STATUS', 'AMOUNT']) {
                    expect(Object.keys(results)).toContain(field);
                }
                expect(results.AMOUNT).toBe('number');
                expect(results.STATUS).toBe('string');
                expect(results.IS_COMPLETED).toBe('boolean');
                expect(results.ORDER_DATE).toBe('date');
            } else {
                for (const field of ['order_id', 'status', 'amount']) {
                    expect(Object.keys(results)).toContain(field);
                }
                expect(results.amount).toBe('number');
                expect(results.status).toBe('string');
                expect(results.is_completed).toBe('boolean');
                expect(results.order_date).toBe('date');
            }
        });

        it(`Get streaming results from ${warehouseName}`, async () => {
            const [database, schema] = getDatabaseDetails(warehouseConfig);
            const selectFields =
                warehouseConfig.type !== WarehouseTypes.SNOWFLAKE
                    ? `*`
                    : `payment_id as "payment_id",
                amount as "amount",
                payment_method as "payment_method"`;
            const sql = `SELECT ${selectFields}
                         FROM ${database}.${schema}.payments
                         ORDER BY payment_id asc LIMIT 2`;

            const runResp = await admin.post<any>(
                `${apiUrl}/projects/${projectUuid}/sqlRunner/run`,
                { sql },
            );
            expect(runResp.status).toBe(200);
            const { jobId } = runResp.body.results;

            const jobResult = await pollJobStatus(admin, jobId, 20, 500);
            expect(jobResult.status).toBe('completed');

            const { fileUrl } = jobResult.details;
            const fileResp = await admin.get<any>(fileUrl);
            expect(fileResp.status).toBe(200);

            const lines = (fileResp.body as string).trim().split('\n');
            const results = lines.map((line: string) => JSON.parse(line));

            expect(results).toHaveLength(2);
            expect(results[0].payment_id).toBe(1);
            expect(results[0].payment_method).toBe('credit_card');
            expect(results[1].payment_id).toBe(2);
            expect(results[1].payment_method).toBe('credit_card');
        });

        it(`Run pivot query for ${warehouseName}`, async () => {
            const [database, schema] = getDatabaseDetails(warehouseConfig);
            const sql =
                warehouseConfig.type === WarehouseTypes.SNOWFLAKE
                    ? `SELECT "orders".order_id AS "order_id",
                    "orders".status AS "status"
                     FROM ${database}.${schema}.orders AS "orders"`
                    : `SELECT * FROM ${database}.${schema}.orders`;
            const pivotQueryPayload = {
                sql,
                indexColumn: { reference: 'status', type: 'category' },
                valuesColumns: [{ reference: 'order_id', aggregation: 'sum' }],
                limit: 500,
            };

            const runResp = await admin.post<any>(
                `${apiUrl}/projects/${projectUuid}/sqlRunner/runPivotQuery`,
                pivotQueryPayload,
            );
            expect(runResp.status).toBe(200);
            const { jobId } = runResp.body.results;

            const jobResult = await pollJobStatus(admin, jobId, 50, 1000);
            expect(jobResult.status).toBe('completed');

            const { fileUrl } = jobResult.details;
            const fileResp = await admin.get<any>(fileUrl);
            expect(fileResp.status).toBe(200);

            const lines = (fileResp.body as string).trim().split('\n');
            const results = lines.map((line: string) => JSON.parse(line));

            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('status');
            expect(results[0]).toHaveProperty('order_id_sum');
        });
    });
}

describe('Saved SQL chart', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('save & update SQL chart', async () => {
        // Get spaces
        const spaceResp = await admin.get<any>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
        );
        const space = spaceResp.body.results[0];

        const sqlChartToCreate: CreateSqlChart = {
            name: 'test',
            description: null,
            sql: 'SELECT * FROM postgres.jaffle.payments',
            limit: 21,
            config: {
                display: {},
                metadata: {
                    version: 1,
                },
                type: ChartKind.TABLE,
                columns: {},
            },
            spaceUuid: space.uuid,
        };

        // Create SQL chart
        const createResp = await admin.post<any>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved`,
            sqlChartToCreate,
        );
        expect(createResp.status).toBe(200);
        const { savedSqlUuid } = createResp.body.results;

        const sqlChartToUpdate: UpdateSqlChart = {
            unversionedData: {
                name: 'test update',
                description: null,
                spaceUuid: space.uuid,
            },
            versionedData: {
                sql: 'SELECT * FROM postgres.jaffle.payments',
                limit: 22,
                config: {
                    display: {},
                    metadata: {
                        version: 1,
                    },
                    type: ChartKind.TABLE,
                    columns: {},
                },
            },
        };

        // Update SQL chart
        const updateResp = await admin.patch<any>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`,
            sqlChartToUpdate,
        );
        expect(updateResp.status).toBe(200);

        // Get SQL chart
        const getResp = await admin.get<any>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`,
        );
        expect(getResp.status).toBe(200);
        const { results } = getResp.body;
        expect(results.name).toBe('test update');
        expect(results.sql).toBe('SELECT * FROM postgres.jaffle.payments');

        // Delete SQL chart
        const deleteResp = await admin.delete(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`,
        );
        expect(deleteResp.status).toBe(200);
    });
});
