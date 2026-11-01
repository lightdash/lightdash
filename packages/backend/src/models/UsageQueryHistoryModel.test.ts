import {
    ProjectType,
    QueryExecutionContext,
    QueryHistoryStatus,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { queryEventsCompactedColumns } from '../analytics/eventStream/queryEventsStream';
import { QUERY_HISTORY_BACKFILL_EVENT } from '../analytics/eventStream/queryHistoryBackfill';
import { UsageQueryHistoryModel } from './UsageQueryHistoryModel';

describe('retained query history for Analytics backfill', () => {
    const organizationUuid = '00000000-0000-0000-0000-000000000001';
    const before = '2026-10-26T12:34:56.789Z';
    let database: Knex;
    let tracker: ReturnType<typeof getTracker>;
    let model: UsageQueryHistoryModel;
    const normalizeSql = (sql: string) => sql.replace(/\$\d+/g, '?');

    const queryRow = (overrides: Record<string, unknown> = {}) => ({
        query_uuid: '00000000-0000-0000-0000-000000000010',
        project_uuid: '00000000-0000-0000-0000-000000000002',
        created_by_user_uuid: '00000000-0000-0000-0000-000000000003',
        context: QueryExecutionContext.EXPLORE,
        status: QueryHistoryStatus.READY,
        warehouse_execution_time_ms: 125,
        total_row_count: 42,
        event_ts: '2026-10-01T15:04:05.123456Z',
        explore_name: 'orders',
        chart_id: 'chart',
        dashboard_id: 'dashboard',
        ...overrides,
    });

    const collect = async (org = organizationUuid) => {
        const rows: Record<string, unknown>[] = [];
        for await (const line of model.getJsonLines(org, before)) {
            expect(line.endsWith('\n')).toBe(true);
            rows.push(JSON.parse(line));
        }
        return rows;
    };

    beforeEach(() => {
        database = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        tracker.reset();
        tracker.on.any(/^SET /i).response([]);
        model = new UsageQueryHistoryModel(database);
    });

    afterEach(async () => {
        tracker.reset();
        await database.destroy();
    });

    it('selects successful and failed queries, including errors without execution timing', async () => {
        tracker.on.select('query_history').response([]);
        await collect();
        const { sql: rawSql, bindings } = tracker.history.select[0];
        const sql = normalizeSql(rawSql);
        expect(sql).toContain('"q"."status" in (?, ?)');
        expect(sql).not.toContain(
            '"q"."warehouse_execution_time_ms" is not null',
        );
        expect(bindings).toContain(QueryHistoryStatus.READY);
        expect(bindings).toContain(QueryHistoryStatus.ERROR);
        for (const status of [
            QueryHistoryStatus.PENDING,
            QueryHistoryStatus.QUEUED,
            QueryHistoryStatus.EXECUTING,
            QueryHistoryStatus.EXPIRED,
            QueryHistoryStatus.CANCELLED,
        ]) {
            expect(bindings).not.toContain(status);
        }
    });

    it('requires the retained row and its project to belong to the authorized organization', async () => {
        tracker.on.select('query_history').response([]);
        const untrustedOrg = "organization' OR true --";
        await collect(untrustedOrg);
        const { sql: rawSql, bindings } = tracker.history.select[0];
        const sql = normalizeSql(rawSql);
        expect(sql).toContain(
            'inner join "projects" as "p" on "p"."project_uuid" = "q"."project_uuid"',
        );
        expect(sql).toContain(
            'inner join "organizations" as "o" on "o"."organization_id" = "p"."organization_id"',
        );
        expect(sql).toContain('"q"."organization_uuid" = ?');
        expect(sql).toContain('"o"."organization_uuid" = ?');
        expect(bindings.filter((value) => value === untrustedOrg)).toHaveLength(
            2,
        );
        expect(sql).not.toContain(untrustedOrg);
    });

    it('limits error text in exported history', async () => {
        tracker.on.select('query_history').responseOnce([
            queryRow({
                status: QueryHistoryStatus.ERROR,
                error: 'x'.repeat(1500),
            }),
        ]);
        tracker.on.select('query_history').response([]);
        const rows = await collect();
        expect(rows[0].error).toBe(`${'x'.repeat(987)}… [truncated]`);
        expect(normalizeSql(tracker.history.select[0].sql)).toContain(
            'LEFT("q"."error", ?) AS "error"',
        );
        expect(tracker.history.select[0].bindings).toContain(1001);
    });

    it('exports the complete stream schema with error text but without SQL or invented timing and identity', async () => {
        tracker.on.select('query_history').responseOnce([
            queryRow({
                compiled_sql: 'SELECT private_business_data FROM customer',
                error: 'private warehouse credentials',
                created_by_account: 'external-person@example.com',
            }),
            queryRow({
                query_uuid: '00000000-0000-0000-0000-000000000011',
                status: QueryHistoryStatus.ERROR,
                created_by_user_uuid: null,
                total_row_count: null,
                warehouse_execution_time_ms: null,
                compiled_sql: 'SELECT other_private_data',
                error: 'column orders missing',
                created_by_account: 'another-external-person@example.com',
            }),
        ]);
        tracker.on.select('query_history').response([]);
        const rows = await collect();
        expect(rows).toHaveLength(2);
        expect(Object.keys(rows[0]).sort()).toEqual(
            queryEventsCompactedColumns.map(({ name }) => name).sort(),
        );
        expect(rows[0]).toMatchObject({
            event_name: QUERY_HISTORY_BACKFILL_EVENT,
            schema_version: 1,
            org_id: organizationUuid,
            project_id: '00000000-0000-0000-0000-000000000002',
            query_id: '00000000-0000-0000-0000-000000000010',
            user_id: '00000000-0000-0000-0000-000000000003',
            event_ts: '2026-10-01T15:04:05.123456Z',
            context: QueryExecutionContext.EXPLORE,
            status: 'success',
            error: null,
            explore_name: 'orders',
            chart_id: 'chart',
            dashboard_id: 'dashboard',
            warehouse_execution_time_ms: 125,
            total_row_count: 42,
            response_time_ms: null,
            response_timing_basis: null,
            cache_hit: null,
            initiating_actor_type: null,
        });
        expect(rows[1]).toMatchObject({
            status: 'error',
            error: 'column orders missing',
            user_id: null,
            warehouse_execution_time_ms: null,
            total_row_count: null,
        });
        expect(JSON.stringify(rows)).not.toMatch(
            /private|secret|external-person|compiled_sql|credentials/,
        );
        const selected = tracker.history.select[0].sql;
        expect(selected).not.toContain('"q"."compiled_sql"');
        expect(selected).toContain('"q"."error"');
        expect(selected).not.toContain('"q"."created_by_account"');
        expect(selected).not.toMatch(/select\s+(?:"q"\.)?\*/i);
        expect(selected).toContain(
            "COALESCE(q.request_parameters->>'chartUuid', q.request_parameters->>'savedSqlUuid') as chart_id",
        );
    });

    it('preserves timestamp ties and microsecond precision across bounded keyset pages', async () => {
        const first = queryRow();
        const second = queryRow({
            query_uuid: '00000000-0000-0000-0000-000000000020',
        });
        const third = queryRow({
            query_uuid: '00000000-0000-0000-0000-000000000005',
            event_ts: '2026-10-01T15:04:05.123457Z',
        });
        tracker.on.select('query_history').responseOnce([first]);
        tracker.on.select('query_history').responseOnce([second]);
        tracker.on.select('query_history').responseOnce([third]);
        tracker.on.select('query_history').response([]);
        expect((await collect()).map((row) => row.query_id)).toEqual([
            first.query_uuid,
            second.query_uuid,
            third.query_uuid,
        ]);
        const pages = tracker.history.select;
        expect(pages).toHaveLength(4);
        expect(normalizeSql(pages[0].sql)).not.toContain(
            '("q"."created_at", "q"."query_uuid") > (?, ?)',
        );
        expect(normalizeSql(pages[1].sql)).toContain(
            '("q"."created_at", "q"."query_uuid") > (?, ?)',
        );
        expect(pages[1].bindings).toContain(first.event_ts);
        expect(pages[1].bindings).toContain(first.query_uuid);
        expect(pages[2].bindings).toContain(second.event_ts);
        expect(pages[2].bindings).toContain(second.query_uuid);
        expect(pages[3].bindings).toContain(third.event_ts);
        expect(pages[3].bindings).toContain(third.query_uuid);
        for (const page of pages) {
            expect(normalizeSql(page.sql)).toContain(
                'order by "q"."created_at" asc, "q"."query_uuid" asc limit ?',
            );
            expect(page.sql).not.toMatch(/\boffset\b/i);
            expect(page.bindings).toContain(1000);
        }
        expect(tracker.history.transactions).toHaveLength(4);
        expect(
            tracker.history.transactions.every(
                (transaction) => transaction.state === 'committed',
            ),
        ).toBe(true);
        expect(
            tracker.history.all.filter(
                ({ sql }) => sql === 'SET TRANSACTION READ ONLY',
            ),
        ).toHaveLength(4);
    });
});
