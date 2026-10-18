import {
    buildSqlChartPipeline,
    ChartType,
    CreateChartInSpace,
    DimensionType,
    generateSlug,
    getPipelineSqlChartSource,
    ResultColumns,
    SEED_PROJECT,
    SQL_CHART_NODE_ID,
    WarehouseTypes,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, SITE_URL } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    bigqueryWarehouseConfig,
    createProject,
    deleteProjectsByName,
    hasBigqueryCredentials,
} from '../helpers/projects';
import { uniqueName } from '../helpers/test-isolation';

const apiUrl = '/api/v1';
const apiV2Url = '/api/v2';

/**
 * Poll an async query until it is ready, then return the streamed JSONL rows.
 */
async function getAsyncSqlQueryRows(
    client: ApiClient,
    projectUuid: string,
    queryUuid: string,
    maxRetries = 60,
    interval = 1000,
): Promise<any[]> {
    for (let i = 0; i < maxRetries; i++) {
        const resp = await client.get<any>(
            `${apiV2Url}/projects/${projectUuid}/query/${queryUuid}`,
        );
        expect(resp.status).toBe(200);
        const { status } = resp.body.results;
        if (status === 'error') {
            throw new Error(`Query failed: ${resp.body.results.error}`);
        }
        if (status === 'ready') {
            const fileResp = await client.get<any>(
                `${apiV2Url}/projects/${projectUuid}/query/${queryUuid}/results`,
            );
            expect(fileResp.status).toBe(200);
            const lines = (fileResp.body as string).trim().split('\n');
            return lines.map((line: string) => JSON.parse(line));
        }
        await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(
        `Reached max retries (${maxRetries}) without query completion`,
    );
}

// Postgres warehouse config using environment variables
const postgresConfig = {
    host: process.env.PGHOST || 'db-dev',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'password',
    dbname: process.env.PGDATABASE || 'postgres',
    schema: 'jaffle',
    port: Number(process.env.PGPORT) || 5432,
    sslmode: 'disable',
    type: WarehouseTypes.POSTGRES,
};

const warehouseEntries: [string, Record<string, unknown>][] = [
    ['postgres', postgresConfig],
    [
        'redshift',
        {
            ...postgresConfig,
            type: WarehouseTypes.REDSHIFT,
        },
    ],
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

// Add bigQuery if credentials file exists and contains a valid private key
if (hasBigqueryCredentials()) {
    warehouseEntries.push(['bigQuery', bigqueryWarehouseConfig()]);
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
                expect(resp.body.results[database][schema].ORDERS).toEqual({
                    tableType: 'table',
                });
            } else {
                for (const table of ['customers', 'orders', 'payments']) {
                    expect(
                        Object.keys(resp.body.results[database][schema]),
                    ).toContain(table);
                }
                expect(resp.body.results[database][schema].orders).toEqual({
                    tableType: 'table',
                });
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
                `${apiV2Url}/projects/${projectUuid}/query/sql`,
                { sql },
            );
            expect(runResp.status).toBe(200);
            const { queryUuid } = runResp.body.results;

            const results = await getAsyncSqlQueryRows(
                admin,
                projectUuid,
                queryUuid,
            );

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
                pivotConfiguration: {
                    indexColumn: { reference: 'status', type: 'category' },
                    valuesColumns: [
                        { reference: 'order_id', aggregation: 'sum' },
                    ],
                },
                limit: 500,
            };

            const runResp = await admin.post<any>(
                `${apiV2Url}/projects/${projectUuid}/query/sql`,
                pivotQueryPayload,
            );
            expect(runResp.status).toBe(200);
            const { queryUuid } = runResp.body.results;

            const results = await getAsyncSqlQueryRows(
                admin,
                projectUuid,
                queryUuid,
            );

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

    it('saves, runs, updates and deletes a SQL chart as a saved chart', async () => {
        const spaceResp = await admin.get<any>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
        );
        const space = spaceResp.body.results[0];

        const sql = 'SELECT payment_method, amount FROM jaffle.payments';
        const columns: ResultColumns = {
            payment_method: {
                reference: 'payment_method',
                type: DimensionType.STRING,
            },
            amount: { reference: 'amount', type: DimensionType.NUMBER },
        };
        const name = uniqueName('SQL chart slug collision');
        const chartToCreate: CreateChartInSpace = {
            name,
            tableName: SQL_CHART_NODE_ID,
            metricQuery: {
                exploreName: SQL_CHART_NODE_ID,
                dimensions: [
                    `${SQL_CHART_NODE_ID}_payment_method`,
                    `${SQL_CHART_NODE_ID}_amount`,
                ],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 21,
                tableCalculations: [],
            },
            chartConfig: { type: ChartType.TABLE },
            tableConfig: {
                columnOrder: [
                    `${SQL_CHART_NODE_ID}_payment_method`,
                    `${SQL_CHART_NODE_ID}_amount`,
                ],
            },
            pipeline: buildSqlChartPipeline({
                sql,
                limit: 21,
                columns,
                warehouseConnectionUuid: null,
            }),
            spaceUuid: space.uuid,
        };

        // Two charts with the same name take distinct slugs
        const [createResp, duplicateResp] = await Promise.all([
            admin.post<any>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
                chartToCreate,
            ),
            admin.post<any>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
                chartToCreate,
            ),
        ]);
        expect(createResp.status).toBe(200);
        expect(duplicateResp.status).toBe(200);
        const { uuid, slug } = createResp.body.results;
        expect(new Set([slug, duplicateResp.body.results.slug])).toEqual(
            new Set([generateSlug(name), `${generateSlug(name)}-1`]),
        );

        // The chart comes back as a one-node SQL pipeline
        const getResp = await admin.get<any>(`${apiUrl}/saved/${uuid}`);
        expect(getResp.status).toBe(200);
        expect(
            getPipelineSqlChartSource(getResp.body.results.pipeline),
        ).toEqual({ sql, limit: 21, warehouseConnectionUuid: null });

        // It runs through the saved chart query endpoint and its rows are
        // keyed by the pipeline's field ids
        const runResp = await admin.post<any>(
            `${apiV2Url}/projects/${SEED_PROJECT.project_uuid}/query/chart`,
            { chartUuid: uuid },
        );
        expect(runResp.status).toBe(200);
        const rows = await getAsyncSqlQueryRows(
            admin,
            SEED_PROJECT.project_uuid,
            runResp.body.results.queryUuid,
        );
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0]).toHaveProperty(`${SQL_CHART_NODE_ID}_payment_method`);
        expect(rows[0]).toHaveProperty(`${SQL_CHART_NODE_ID}_amount`);

        // A new version replaces the statement
        const updatedSql = 'SELECT payment_method FROM jaffle.payments';
        const versionResp = await admin.post<any>(
            `${apiUrl}/saved/${uuid}/version`,
            {
                tableName: SQL_CHART_NODE_ID,
                metricQuery: {
                    ...chartToCreate.metricQuery,
                    dimensions: [`${SQL_CHART_NODE_ID}_payment_method`],
                    limit: 22,
                },
                chartConfig: chartToCreate.chartConfig,
                tableConfig: {
                    columnOrder: [`${SQL_CHART_NODE_ID}_payment_method`],
                },
                pipeline: buildSqlChartPipeline({
                    sql: updatedSql,
                    limit: 22,
                    columns: { payment_method: columns.payment_method },
                    warehouseConnectionUuid: null,
                }),
            },
        );
        expect(versionResp.status).toBe(200);
        const updatedResp = await admin.get<any>(`${apiUrl}/saved/${uuid}`);
        expect(
            getPipelineSqlChartSource(updatedResp.body.results.pipeline),
        ).toEqual({
            sql: updatedSql,
            limit: 22,
            warehouseConnectionUuid: null,
        });

        // The name can be saved again after a delete; whether the slug is
        // reused depends on whether the instance soft deletes
        const deleteResp = await admin.delete(`${apiUrl}/saved/${uuid}`);
        expect(deleteResp.status).toBe(200);
        await admin.delete(
            `${apiUrl}/saved/${duplicateResp.body.results.uuid}`,
        );
        const recreatedResp = await admin.post<any>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            chartToCreate,
        );
        expect(recreatedResp.status).toBe(200);
        expect(recreatedResp.body.results.slug).toMatch(
            new RegExp(`^${generateSlug(name)}`),
        );
        await admin.delete(
            `${apiUrl}/saved/${recreatedResp.body.results.uuid}`,
        );
    });
});
