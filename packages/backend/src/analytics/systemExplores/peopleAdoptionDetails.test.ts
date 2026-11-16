import { DuckDBInstance } from '@duckdb/node-api';
import { peopleMembershipColumns } from '../eventStream/peopleMembership';
import { compactedStreamSchemas } from '../eventStream/registry';
import { peopleAdoptionDetailsSql } from './peopleAdoptionDetails';

it('keeps deduplicated membership and uses closed days for feature, recency and growth colors', async () => {
    const instance = await DuckDBInstance.create(':memory:', { threads: '1' });
    const db = await instance.connect();
    try {
        const ddl = (name: string, columns: { name: string; type: string }[]) =>
            `CREATE TABLE ${name} (${columns.map((column) => `${column.name} ${column.type}`).join(', ')})`;
        await db.run(
            [
                ddl('lightdash_people', peopleMembershipColumns),
                ...[
                    'content_views',
                    'query_events',
                    'agent_request_events',
                    'mcp_tool_calls',
                    'data_app_events',
                    'export_events',
                ].map((stream) =>
                    ddl(
                        stream,
                        compactedStreamSchemas[
                            stream as keyof typeof compactedStreamSchemas
                        ],
                    ),
                ),
                `INSERT INTO lightdash_people (org_id, user_id, snapshot_at, is_active)
                VALUES ('org', 'active', '2026-10-01', false),
                    ('org', 'active', '2026-10-02', true),
                    ('org', 'never', '2026-10-02', true)`,
                `INSERT INTO content_views (org_id, user_id, event_ts, is_qualifying, actor_type, content_type)
                VALUES ('org', 'active', '2026-10-01', true, 'user', 'dashboard'),
                    ('org', 'active', '2026-09-01', true, 'user', 'chart'),
                    ('org', 'active', '2026-10-02', true, 'user', 'chart'),
                    ('org', 'never', '2026-10-01', true, 'embed', 'dashboard')`,
                `INSERT INTO mcp_tool_calls (org_id, user_id, event_ts, actor_type)
                VALUES ('org', 'active', '2026-09-30', 'user')`,
            ].join(';'),
        );
        const result = await db.runAndReadAll(
            `SELECT user_id, is_active, parts_used, last_seen, flow_bits
            FROM ${peopleAdoptionDetailsSql} ORDER BY user_id`,
        );
        expect(result.getRowObjectsJson()).toEqual([
            {
                user_id: 'active',
                is_active: true,
                parts_used: '17',
                last_seen: 'd7',
                flow_bits: '3',
            },
            {
                user_id: 'never',
                is_active: true,
                parts_used: '0',
                last_seen: 'never',
                flow_bits: '0',
            },
        ]);
    } finally {
        db.closeSync();
        instance.closeSync();
    }
});
