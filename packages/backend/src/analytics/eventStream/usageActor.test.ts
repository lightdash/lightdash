import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { usageActorNameSql, usageActorSql } from './usageActor';
import { buildUserActivitySql } from './UsageUserActivityBuilder';

const literal = (value: unknown) =>
    value == null ? 'NULL::VARCHAR' : `'${String(value).replace(/'/g, "''")}'`;

let db: DuckDBInstance;
let connection: DuckDBConnection;
beforeAll(async () => {
    db = await DuckDBInstance.create(':memory:');
    connection = await db.connect();
});
afterAll(() => {
    connection.closeSync();
    db.closeSync();
});

const classify = async (
    stream: string,
    values: Record<string, string | null>,
) => {
    const { actorType } = usageActorSql(stream, (name) =>
        literal(values[name]),
    );
    const sql = usageActorNameSql(stream)
        .replace(/\$\{TABLE\}\.name/g, literal(values.name))
        .replace(/\$\{[^.]+\.([^}]+)\}/g, (_, name: string) =>
            literal(values[name]),
        );
    return (
        await connection.runAndReadAll(
            `SELECT ${actorType} AS category, ${sql} AS name`,
        )
    ).getRowObjects()[0];
};

describe('usage actor attribution', () => {
    it.each([
        ['query_events', { context: 'embed' }, 'embed', 'Embedded viewer'],
        [
            'query_events',
            { context: 'api' },
            'unattributed',
            'User not recorded',
        ],
        [
            'query_events',
            { workload_origin: 'scheduled' },
            'scheduled',
            'Scheduled activity',
        ],
        [
            'query_events',
            { initiating_actor_type: 'service_account', user_id: 'service' },
            'service_account',
            'Service account',
        ],
        ['content_views', { actor_type: 'embed' }, 'embed', 'Embedded viewer'],
        [
            'ai_usage',
            { feature: 'embedding' },
            'ai',
            'AI activity · Embeddings',
        ],
        [
            'ai_usage',
            { feature: 'agent-suggestions' },
            'ai',
            'AI activity · Suggestions',
        ],
        [
            'ai_usage',
            { feature: 'review-classifier' },
            'ai',
            'AI activity · Review classification',
        ],
        ['ai_usage', { feature: 'new-feature' }, 'ai', 'AI activity'],
        [
            'ai_usage',
            { user_id: 'user', name: ' Pat ', feature: 'embedding' },
            'registered_user',
            'Pat',
        ],
        [
            'query_events',
            { user_id: 'deleted-or-unexported' },
            'registered_user',
            'User name unavailable',
        ],
        [
            'query_events',
            { user_id: 'blank-name', name: '  ' },
            'registered_user',
            'User name unavailable',
        ],
        [
            'mcp_tool_calls',
            { actor_type: 'service_account' },
            'service_account',
            'Service account',
        ],
        ['data_app_events', {}, 'unattributed', 'User not recorded'],
        ['user_activity', { stream: 'ai_usage' }, 'ai', 'AI activity'],
        [
            'user_activity',
            { stream: 'content_views' },
            'unattributed',
            'User not recorded',
        ],
        [
            'user_activity',
            { actor_category: 'embed', stream: 'content_views' },
            'embed',
            'Embedded viewer',
        ],
    ] as [string, Record<string, string>, string, string][])(
        'classifies %s using %j without inventing an identity',
        async (stream, values, category, name) => {
            expect(await classify(stream, values)).toEqual({ category, name });
        },
    );

    it('keeps separate AI sources without losing tokens or inventing users', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'usage-ai-actors-'));
        try {
            const input = path.join(dir, 'input.parquet');
            const output = path.join(dir, 'output.parquet');
            await connection.run(`COPY (SELECT 'org' AS org_id, 'project' AS project_id,
                NULL::VARCHAR AS user_id, 'ai.usage' AS event_name,
                TIMESTAMP '2026-01-01 12:00:00' AS event_ts, feature, total_tokens
                FROM (VALUES ('embedding', 10), ('embedding', 20), ('agent-suggestions', 40)) v(feature, total_tokens)
            ) TO '${input}' (FORMAT PARQUET)`);
            await connection.run(
                buildUserActivitySql(
                    'org',
                    'ai_usage',
                    '2026-01-01',
                    [input],
                    output,
                ),
            );
            expect(
                (
                    await connection.runAndReadAll(
                        `SELECT actor_category, activity_source, event_count, total_tokens FROM read_parquet('${output}') ORDER BY activity_source`,
                    )
                ).getRowObjects(),
            ).toEqual([
                {
                    actor_category: 'ai',
                    activity_source: 'agent-suggestions',
                    event_count: 1n,
                    total_tokens: 40n,
                },
                {
                    actor_category: 'ai',
                    activity_source: 'embedding',
                    event_count: 2n,
                    total_tokens: 30n,
                },
            ]);
            expect(
                (
                    await connection.runAndReadAll(
                        `SELECT count(DISTINCT user_id) AS users FROM read_parquet('${output}')`,
                    )
                ).getRowObjects(),
            ).toEqual([{ users: 0n }]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('rebuilds old-schema Parquet with source labels while preserving totals, dates and tenants', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'usage-actors-'));
        const input = path.join(dir, 'input.parquet');
        const output = path.join(dir, 'output.parquet');
        try {
            // Deliberately predates workload_origin and initiating_actor_type.
            await connection.run(`COPY (SELECT * FROM (VALUES
                ('org', 'project', NULL, 'query.completed', TIMESTAMP '2026-01-01 12:00:00', 'q1', 'embed'),
                ('org', 'project', NULL, 'query.completed', TIMESTAMP '2026-01-01 12:00:00', 'q2', 'api'),
                ('org', 'project', 'person', 'query.completed', TIMESTAMP '2026-01-01 12:00:00', 'q3', 'exploreView'),
                ('other-org', 'project', NULL, 'query.completed', TIMESTAMP '2026-01-01 12:00:00', 'q4', 'embed'),
                ('org', 'project', NULL, 'query.completed', TIMESTAMP '2026-01-02 12:00:00', 'q5', 'embed')
            ) v(org_id, project_id, user_id, event_name, event_ts, query_id, context)) TO '${input}' (FORMAT PARQUET)`);
            await connection.run(
                buildUserActivitySql(
                    'org',
                    'query_events',
                    '2026-01-01',
                    [input],
                    output,
                ),
            );
            const rows = (
                await connection.runAndReadAll(
                    `SELECT actor_category, activity_source, event_count, query_count FROM read_parquet('${output}') ORDER BY actor_category`,
                )
            ).getRowObjects();
            expect(rows).toEqual([
                {
                    actor_category: 'embed',
                    activity_source: 'embed',
                    event_count: 1n,
                    query_count: 1n,
                },
                {
                    actor_category: 'registered_user',
                    activity_source: 'exploreView',
                    event_count: 1n,
                    query_count: 1n,
                },
                {
                    actor_category: 'unattributed',
                    activity_source: 'api',
                    event_count: 1n,
                    query_count: 1n,
                },
            ]);
            expect(
                (
                    await connection.runAndReadAll(
                        `SELECT count(DISTINCT user_id) AS users, sum(event_count) AS events FROM read_parquet('${output}')`,
                    )
                ).getRowObjects(),
            ).toEqual([{ users: 1n, events: 3n }]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
