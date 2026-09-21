import { S3 } from '@aws-sdk/client-s3';
import { WarehouseTypes } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { randomUUID } from 'crypto';
import knex from 'knex';
import { gzipSync } from 'zlib';
import { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { createS3AnalyticsSourceResolver } from '../../services/ProjectService/analyticsProject/S3AnalyticsSource';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { usageDimensionKey } from './usageDimensions';
import { UsageEventsCompactor } from './UsageEventsCompactor';

// Opt-in: dedicated schema and bucket on an isolated local development stack.
describe.skipIf(!process.env.USAGE_DIMENSIONS_SMOKE_PGPORT)(
    'Postgres usage dimensions to local S3 and joined explores',
    () => {
        it('refreshes batched snapshots and joins current names without losing events', async () => {
            vi.unstubAllGlobals();
            const endpoint = process.env.USAGE_EVENTS_S3_ENDPOINT ?? '';
            if (
                !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)
            ) {
                throw new Error('Dimension smoke tests require local S3');
            }
            const schema = `usage_dims_${randomUUID().replaceAll('-', '')}`;
            const db = knex({
                client: 'pg',
                connection: {
                    host: 'localhost',
                    port: Number(process.env.USAGE_DIMENSIONS_SMOKE_PGPORT),
                    user: process.env.PGUSER ?? 'postgres',
                    password: process.env.PGPASSWORD ?? 'password',
                    database: process.env.PGDATABASE ?? 'postgres',
                },
                searchPath: [schema],
                pool: { min: 0, max: 2 },
            });
            const fixture = (table: string) => db(table);
            const storage = {
                endpoint,
                bucket: `usage-dims-${randomUUID()}`,
                region: 'us-east-1',
                accessKey: process.env.USAGE_EVENTS_S3_ACCESS_KEY,
                secretKey: process.env.USAGE_EVENTS_S3_SECRET_KEY,
                forcePathStyle: true,
            };
            const s3 = new S3({
                endpoint,
                region: storage.region,
                forcePathStyle: true,
                credentials: {
                    accessKeyId: storage.accessKey!,
                    secretAccessKey: storage.secretKey!,
                },
            });
            const org = randomUUID();
            const otherOrg = randomUUID();
            const user = randomUUID();
            const otherUser = randomUUID();
            const chart = randomUUID();
            const dashboard = randomUUID();
            const project = randomUUID();
            const agent = randomUUID();
            const otherAgent = randomUUID();
            const rows = Number(
                process.env.USAGE_DIMENSIONS_SMOKE_ROWS ?? 2500,
            );
            let bucketCreated = false;
            try {
                await db.raw('CREATE SCHEMA ??', [schema]);
                await db.raw(`
                    CREATE TABLE ai_agent (ai_agent_uuid uuid PRIMARY KEY, organization_uuid uuid, name text);
                    CREATE TABLE organizations (organization_id integer PRIMARY KEY, organization_uuid uuid UNIQUE);
                    CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid UNIQUE, organization_id integer);
                    CREATE TABLE spaces (space_id integer PRIMARY KEY, space_uuid uuid UNIQUE, project_id integer, name text, deleted_at timestamp);
                    CREATE TABLE dashboards (dashboard_id integer PRIMARY KEY, dashboard_uuid uuid UNIQUE, space_id integer, name text, slug text, deleted_at timestamp);
                    CREATE TABLE saved_queries (saved_query_id integer PRIMARY KEY, saved_query_uuid uuid UNIQUE, project_uuid uuid, space_id integer, dashboard_uuid uuid, name text, slug text, last_version_chart_kind text, deleted_at timestamp);
                    CREATE INDEX ON saved_queries(project_uuid);
                    CREATE TABLE saved_sql (saved_sql_uuid uuid PRIMARY KEY, project_uuid uuid, space_uuid uuid, dashboard_uuid uuid, name text, slug text, last_version_chart_kind text, deleted_at timestamp);
                    CREATE TABLE users (user_id integer PRIMARY KEY, user_uuid uuid UNIQUE, first_name text, last_name text, is_active boolean, is_internal boolean);
                    CREATE TABLE organization_memberships (organization_id integer, user_id integer, PRIMARY KEY(organization_id, user_id));
                `);
                await fixture('organizations').insert([
                    { organization_id: 1, organization_uuid: org },
                    { organization_id: 2, organization_uuid: otherOrg },
                ]);
                await fixture('projects').insert({
                    project_id: 1,
                    project_uuid: project,
                    organization_id: 1,
                });
                await fixture('ai_agent').insert([
                    {
                        ai_agent_uuid: agent,
                        organization_uuid: org,
                        name: 'Sales analyst',
                    },
                    {
                        ai_agent_uuid: otherAgent,
                        organization_uuid: otherOrg,
                        name: 'Other org agent',
                    },
                ]);
                await db.raw(
                    `INSERT INTO ai_agent SELECT md5('agent-' || n)::uuid, ?::uuid, 'Agent ' || n FROM generate_series(1, 1001) n`,
                    [org],
                );
                await fixture('spaces').insert({
                    space_id: 1,
                    space_uuid: randomUUID(),
                    project_id: 1,
                    name: 'Shared space',
                });
                await fixture('dashboards').insert({
                    dashboard_id: 1,
                    dashboard_uuid: dashboard,
                    space_id: 1,
                    name: 'Dashboard before',
                    slug: 'dashboard',
                });
                await fixture('saved_queries').insert({
                    saved_query_id: 1,
                    saved_query_uuid: chart,
                    project_uuid: project,
                    dashboard_uuid: dashboard,
                    name: 'Chart before',
                    slug: 'chart',
                    last_version_chart_kind: 'cartesian',
                });
                await db.raw(
                    `INSERT INTO saved_queries (saved_query_id, saved_query_uuid, project_uuid, space_id, name, slug, last_version_chart_kind)
                    SELECT n + 1, md5('chart-' || n)::uuid, ?::uuid, 1, 'Chart ' || n, 'chart-' || n, 'table' FROM generate_series(1, ?) n`,
                    [project, rows],
                );
                await fixture('saved_sql').insert({
                    saved_sql_uuid: randomUUID(),
                    project_uuid: project,
                    dashboard_uuid: dashboard,
                    name: 'SQL chart',
                    slug: 'sql-chart',
                    last_version_chart_kind: 'table',
                });
                await fixture('users').insert([
                    {
                        user_id: 1,
                        user_uuid: user,
                        first_name: 'Same',
                        last_name: 'Name',
                        is_active: true,
                        is_internal: false,
                    },
                    {
                        user_id: 2,
                        user_uuid: randomUUID(),
                        first_name: 'Same',
                        last_name: 'Name',
                        is_active: true,
                        is_internal: false,
                    },
                    {
                        user_id: 3,
                        user_uuid: otherUser,
                        first_name: 'Other',
                        last_name: 'Org',
                        is_active: true,
                        is_internal: false,
                    },
                ]);
                await fixture('organization_memberships').insert([
                    { organization_id: 1, user_id: 1 },
                    { organization_id: 1, user_id: 2 },
                    { organization_id: 2, user_id: 3 },
                ]);
                await db.raw(
                    'ANALYZE projects; ANALYZE spaces; ANALYZE dashboards; ANALYZE saved_queries; ANALYZE users; ANALYZE organization_memberships',
                );
                await s3.createBucket({ Bucket: storage.bucket });
                bucketCreated = true;
                const rawKey = `events/raw/org_id=${org}/stream=query_events/dt=2026-01-01/test.jsonl.gz`;
                const events = [
                    { user_id: user, chart_id: chart, dashboard_id: dashboard },
                    {
                        user_id: otherUser,
                        chart_id: randomUUID(),
                        dashboard_id: null,
                    },
                    { user_id: null, chart_id: null, dashboard_id: null },
                ].map((event) => ({
                    ...event,
                    org_id: org,
                    event_ts: '2026-01-01T00:00:00Z',
                    status: 'success',
                    query_id: randomUUID(),
                }));
                await s3.putObject({
                    Bucket: storage.bucket,
                    Key: rawKey,
                    Body: gzipSync(
                        events.map((row) => JSON.stringify(row)).join('\n'),
                    ),
                });
                await s3.putObject({
                    Bucket: storage.bucket,
                    Key: `events/raw/org_id=${org}/stream=export_events/dt=2026-01-01/test.jsonl.gz`,
                    Body: gzipSync(
                        JSON.stringify({
                            ...events[0],
                            event_name: 'download_results.completed',
                        }),
                    ),
                });
                await s3.putObject({
                    Bucket: storage.bucket,
                    Key: `events/raw/org_id=${org}/stream=ai_usage/dt=2026-01-01/test.jsonl.gz`,
                    Body: gzipSync(
                        [agent, otherAgent, null]
                            .map((agentId) =>
                                JSON.stringify({
                                    org_id: org,
                                    user_id: user,
                                    event_name: 'ai.usage',
                                    event_ts: '2026-01-01T00:00:00Z',
                                    agent_id: agentId,
                                }),
                            )
                            .join('\n'),
                    ),
                });
                const run = () =>
                    new UsageEventsCompactor({
                        s3Config: storage,
                        prometheusMetrics: null,
                        usageDimensionsModel: new UsageDimensionsModel(db),
                    }).run(new Date('2026-01-02'));
                const summary = await run();
                expect(summary.dimensions).toEqual({
                    refreshed: 8,
                    failed: 0,
                });
                const source = createS3AnalyticsSourceResolver({
                    storage,
                    organizationUuid: org,
                });
                const reader = new DuckdbWarehouseClient({
                    type: 'duckdb_parquet',
                    resolveSource: source,
                });
                const explore = createAnalyticsExplores()[0];
                const sql = (
                    dimensions: string[],
                    queryExplore = explore,
                    metrics = ['query_events_total_queries'],
                ) =>
                    new MetricQueryBuilder({
                        explore: queryExplore,
                        compiledMetricQuery: {
                            exploreName: queryExplore.name,
                            dimensions,
                            metrics,
                            filters: {},
                            sorts: [],
                            limit: 100,
                            tableCalculations: [],
                            compiledAdditionalMetrics: [],
                            compiledTableCalculations: [],
                            compiledCustomDimensions: [],
                        },
                        warehouseSqlBuilder: warehouseSqlBuilderFromType(
                            WarehouseTypes.DUCKDB,
                        ),
                        intrinsicUserAttributes: {},
                        parameterDefinitions: {},
                        timezone: 'UTC',
                    }).compileQuery().query;
                expect(sql([])).not.toContain('JOIN');
                const exportResult = await reader.runQuery(
                    sql(
                        ['query_events_chart_id', 'lightdash_users_name'],
                        createAnalyticsExplores()[3],
                        ['export_events_total_events'],
                    ),
                );
                expect(exportResult.rows).toEqual([
                    {
                        query_events_chart_id: chart,
                        lightdash_users_name: 'Same Name',
                        export_events_total_events: '1',
                    },
                ]);
                const agentSql = sql(
                    ['lightdash_agents_name'],
                    createAnalyticsExplores()[1],
                    ['ai_usage_total_ai_calls'],
                );
                expect((await reader.runQuery(agentSql)).rows).toEqual(
                    expect.arrayContaining([
                        {
                            lightdash_agents_name: 'Sales analyst',
                            ai_usage_total_ai_calls: '1',
                        },
                        {
                            lightdash_agents_name: 'Unknown agent',
                            ai_usage_total_ai_calls: '2',
                        },
                    ]),
                );
                expect(
                    (
                        await reader.runQuery(
                            'SELECT count(*) AS n FROM lightdash_agents',
                        )
                    ).rows,
                ).toEqual([{ n: '1002' }]);
                expect(
                    (
                        await reader.runQuery(
                            sql([], createAnalyticsExplores()[1], [
                                'ai_usage_total_ai_calls',
                            ]),
                        )
                    ).rows,
                ).toEqual([{ ai_usage_total_ai_calls: '3' }]);
                const joinedSql = sql([
                    'lightdash_charts_name',
                    'lightdash_dashboards_name',
                    'lightdash_users_name',
                ]);
                const result = await reader.runQuery(joinedSql);
                expect(result.rows).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            lightdash_charts_name: 'Chart before',
                            lightdash_dashboards_name: 'Dashboard before',
                            lightdash_users_name: 'Same Name',
                            query_events_total_queries: '1',
                        }),
                        expect.objectContaining({
                            lightdash_charts_name: null,
                            lightdash_users_name: 'Unknown user',
                            query_events_total_queries: '2',
                        }),
                    ]),
                );
                expect(
                    (await reader.runQuery(sql([]))).rows[0]
                        .query_events_total_queries,
                ).toBe('3');
                expect(
                    (
                        await reader.runQuery(
                            'SELECT count(*) AS n FROM lightdash_charts',
                        )
                    ).rows[0].n,
                ).toBe(String(rows + 2));
                expect(
                    (
                        await reader.runQuery(
                            "SELECT name, space_name FROM lightdash_charts WHERE name = 'SQL chart'",
                        )
                    ).rows,
                ).toEqual([{ name: 'SQL chart', space_name: 'Shared space' }]);
                const originalSnapshot = await s3.headObject({
                    Bucket: storage.bucket,
                    Key: usageDimensionKey(org, 'charts'),
                });
                const failingModel = new UsageDimensionsModel(db);
                const read = failingModel.getJsonLines.bind(failingModel);
                vi.spyOn(failingModel, 'getJsonLines').mockImplementation(
                    async function* interruptedExport(organization, dimension) {
                        if (
                            organization.organization_uuid === org &&
                            dimension === 'charts'
                        ) {
                            yield '{}\n';
                            throw new Error(
                                'Injected interrupted database export',
                            );
                        }
                        yield* read(organization, dimension);
                    },
                );
                await expect(
                    new UsageEventsCompactor({
                        s3Config: storage,
                        prometheusMetrics: null,
                        usageDimensionsModel: failingModel,
                    }).run(new Date('2026-01-02')),
                ).rejects.toThrow('1 refreshes failed');
                expect(
                    (
                        await s3.headObject({
                            Bucket: storage.bucket,
                            Key: usageDimensionKey(org, 'charts'),
                        })
                    ).ETag,
                ).toBe(originalSnapshot.ETag);
                expect((await run()).dimensions).toEqual({
                    refreshed: 8,
                    failed: 0,
                });
                await fixture('ai_agent')
                    .where('ai_agent_uuid', agent)
                    .update({ name: 'Sales renamed' });
                await fixture('saved_queries')
                    .where('saved_query_id', 1)
                    .update({ name: 'Chart renamed' });
                await fixture('dashboards')
                    .where('dashboard_id', 1)
                    .update({ name: 'Dashboard renamed' });
                await fixture('users')
                    .where('user_id', 1)
                    .update({ first_name: 'User renamed' });
                expect((await run()).dimensions).toEqual({
                    refreshed: 8,
                    failed: 0,
                });
                expect((await reader.runQuery(joinedSql)).rows).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            lightdash_charts_name: 'Chart renamed',
                            lightdash_dashboards_name: 'Dashboard renamed',
                            lightdash_users_name: 'User renamed Name',
                        }),
                    ]),
                );
                expect((await reader.runQuery(agentSql)).rows).toContainEqual({
                    lightdash_agents_name: 'Sales renamed',
                    ai_usage_total_ai_calls: '1',
                });
                await fixture('ai_agent')
                    .where('ai_agent_uuid', agent)
                    .delete();
                await fixture('organization_memberships')
                    .where({ organization_id: 1, user_id: 1 })
                    .delete();
                await fixture('saved_queries')
                    .where('saved_query_id', 1)
                    .update({ deleted_at: new Date() });
                await run();
                expect(
                    (await reader.runQuery(joinedSql)).rows.every(
                        (row) => row.lightdash_users_name === 'Unknown user',
                    ),
                ).toBe(true);
                expect(
                    (
                        await reader.runQuery(
                            `SELECT is_deleted FROM lightdash_charts WHERE chart_id = '${chart}'`,
                        )
                    ).rows[0].is_deleted,
                ).toBe(true);
                expect((await reader.runQuery(agentSql)).rows).toEqual([
                    {
                        lightdash_agents_name: 'Unknown agent',
                        ai_usage_total_ai_calls: '3',
                    },
                ]);
                await s3.deleteObject({
                    Bucket: storage.bucket,
                    Key: usageDimensionKey(org, 'agents'),
                });
                expect((await reader.runQuery(agentSql)).rows).toEqual([
                    {
                        lightdash_agents_name: 'Unknown agent',
                        ai_usage_total_ai_calls: '3',
                    },
                ]);
                await s3.deleteObject({
                    Bucket: storage.bucket,
                    Key: usageDimensionKey(org, 'users'),
                });
                expect(
                    (await reader.runQuery(joinedSql)).rows.every(
                        (row) => row.lightdash_users_name === 'Unknown user',
                    ),
                ).toBe(true);
            } finally {
                if (bucketCreated) {
                    const objects = await s3.listObjectsV2({
                        Bucket: storage.bucket,
                    });
                    if (objects.Contents?.length)
                        await s3.deleteObjects({
                            Bucket: storage.bucket,
                            Delete: {
                                Objects: objects.Contents.map(({ Key }) => ({
                                    Key,
                                })),
                            },
                        });
                    await s3.deleteBucket({ Bucket: storage.bucket });
                }
                s3.destroy();
                await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
                await db.destroy();
            }
        }, 600_000);
    },
);
