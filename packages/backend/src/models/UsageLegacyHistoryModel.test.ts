import { ProjectType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { historicalActivityColumns } from '../analytics/eventStream/usageHistorySources';
import { UsageLegacyHistoryModel } from './UsageLegacyHistoryModel';

const sourceDefinitions = [
    { table: 'analytics_chart_views', timestamp: 'timestamp' },
    { table: 'analytics_dashboard_views', timestamp: 'timestamp' },
    { table: 'analytics_app_views', timestamp: 'timestamp' },
    { table: 'apps', timestamp: 'created_at' },
    { table: 'apps', timestamp: 'deleted_at' },
    { table: 'app_versions', timestamp: 'created_at' },
];

describe('retained database content activity for Analytics history', () => {
    const org = '00000000-0000-0000-0000-000000000001';
    const before = '2026-10-26T12:34:56.789Z';
    const project = '00000000-0000-0000-0000-000000000002';
    let database: Knex;
    let tracker: ReturnType<typeof getTracker>;
    let model: UsageLegacyHistoryModel;
    const normalizeSql = (sql: string) => sql.replace(/\$\d+/g, '?');
    const matches =
        (table: string, timestamp = 'timestamp') =>
        ({ sql }: { sql: string }) =>
            sql.includes(`from "${table}" as "h"`) &&
            sql.includes(`where `) &&
            normalizeSql(sql).includes(`"h"."${timestamp}" < ?`);
    const emptySources = (except?: string, timestamp = 'timestamp') => {
        for (const source of sourceDefinitions) {
            if (source.table !== except || source.timestamp !== timestamp) {
                tracker.on
                    .select(matches(source.table, source.timestamp))
                    .response([]);
            }
        }
    };
    const storedRow = (overrides: Record<string, unknown> = {}) => ({
        source_id: '00000000-0000-0000-0000-000000000010',
        project_id: project,
        user_id: '00000000-0000-0000-0000-000000000003',
        content_id: '00000000-0000-0000-0000-000000000004',
        event_ts: '2026-09-01T15:04:05.123456Z',
        ...overrides,
    });
    const collect = async (organization = org) => {
        const rows: Record<string, unknown>[] = [];
        for await (const line of model.getJsonLines(organization, before)) {
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
        for (const table of ['saved_queries', 'dashboards']) {
            tracker.on
                .select((query) => query.sql.includes(`from "${table}" as "c"`))
                .responseOnce([
                    { content_id: '00000000-0000-0000-0000-000000000004' },
                ]);
            tracker.on
                .select((query) => query.sql.includes(`from "${table}" as "c"`))
                .response([]);
        }
        model = new UsageLegacyHistoryModel(database);
    });

    afterEach(async () => {
        tracker.reset();
        await database.destroy();
    });

    it('scopes every source to its owning organization, includes retained deleted content, and excludes previews', async () => {
        emptySources();
        const untrustedOrg = "organization' OR true --";
        expect(await collect(untrustedOrg)).toEqual([]);
        expect(tracker.history.select).toHaveLength(
            sourceDefinitions.length + 4,
        );
        for (const { sql: rawSql, bindings } of tracker.history.select) {
            const sql = normalizeSql(rawSql);
            expect(sql).toContain(
                'inner join "organizations" as "o" on "o"."organization_id" = "p"."organization_id"',
            );
            expect(sql).toContain('"o"."organization_uuid" = ?');
            expect(bindings).toContain(untrustedOrg);
            expect(sql).not.toContain(untrustedOrg);
            expect(sql).toContain('not "p"."project_type" = ?');
            expect(bindings).toContain(ProjectType.PREVIEW);
            expect(sql).not.toMatch(/"deleted_at" is null/);
            expect(sql).not.toContain('join "users"');
        }
        const dashboard = tracker.history.select.find(({ sql }) =>
            sql.includes('from "analytics_dashboard_views"'),
        )!;
        expect(dashboard.sql).toContain(
            'inner join "spaces" as "s" on "s"."space_id" = "c"."space_id"',
        );
        expect(dashboard.sql).toContain(
            'inner join "projects" as "p" on "p"."project_id" = "s"."project_id"',
        );
    });

    it('exports all retained dates at database precision without inventing native fetch or navigation metadata', async () => {
        emptySources('analytics_chart_views');
        tracker.on.select(matches('analytics_chart_views')).responseOnce([
            storedRow({
                context: 'dashboard',
                dashboard_id: '00000000-0000-0000-0000-000000000005',
                prompt: 'private prompt',
                compiled_sql: 'SELECT secret',
                content_name: 'private title',
            }),
            storedRow({
                source_id: '00000000-0000-0000-0000-000000000011',
                user_id: null,
            }),
        ]);
        tracker.on.select(matches('analytics_chart_views')).response([]);
        const rows = await collect();
        expect(rows).toHaveLength(2);
        expect(Object.keys(rows[0]).sort()).toEqual(
            historicalActivityColumns.map(({ name }) => name).sort(),
        );
        expect(rows[0]).toMatchObject({
            history_source: 'analytics_chart_views',
            record_id:
                'chart_view_or_execution:00000000-0000-0000-0000-000000000010',
            activity_type: 'chart_view_or_execution',
            org_id: org,
            project_id: project,
            user_id: '00000000-0000-0000-0000-000000000003',
            content_type: 'chart',
            event_ts: '2026-09-01T15:04:05.123456Z',
            context: 'dashboard',
            dashboard_id: '00000000-0000-0000-0000-000000000005',
            app_id: null,
            version: null,
            current_status: null,
            success: null,
        });
        expect(rows[1].user_id).toBeNull();
        expect(rows[1].context).toBeNull();
        expect(JSON.stringify(rows)).not.toMatch(
            /private|secret|compiled_sql|content_name|"prompt"/,
        );
        const { sql, bindings } = tracker.history.select.find(
            ({ sql: query }) => query.includes('from "analytics_chart_views"'),
        )!;
        expect(sql).toContain(
            'to_char("h"."timestamp", \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as event_ts',
        );
        expect(bindings).toContain(before);
        expect(sql).not.toMatch(/"h"\."timestamp"\s*>=?/);
        expect(sql).not.toMatch(/select\s+(?:"h"\.)?\*/i);
        expect(sql).toContain("h.context->>'source' = 'dashboard'");
        expect(sql).not.toContain('"h"."context"');
    });

    it('streams bounded keyset pages in separate read-only transactions', async () => {
        emptySources('analytics_app_views');
        const first = storedRow();
        const second = storedRow({
            source_id: '00000000-0000-0000-0000-000000000020',
        });
        const third = storedRow({
            source_id: '00000000-0000-0000-0000-000000000030',
        });
        tracker.on
            .select(matches('analytics_app_views'))
            .responseOnce([first, second]);
        tracker.on.select(matches('analytics_app_views')).responseOnce([third]);
        tracker.on.select(matches('analytics_app_views')).response([]);
        expect((await collect()).map((row) => row.record_id)).toEqual([
            `app_view:${first.source_id}`,
            `app_view:${second.source_id}`,
            `app_view:${third.source_id}`,
        ]);
        const pages = tracker.history.select.filter(({ sql }) =>
            sql.includes('from "analytics_app_views"'),
        );
        expect(pages).toHaveLength(3);
        expect(normalizeSql(pages[0].sql)).not.toContain(
            '"h"."analytics_app_view_uuid" > ?',
        );
        expect(normalizeSql(pages[1].sql)).toContain(
            '"h"."analytics_app_view_uuid" > ?',
        );
        expect(pages[1].bindings).toContain(second.source_id);
        expect(pages[2].bindings).toContain(third.source_id);
        for (const page of tracker.history.select) {
            expect(page.bindings).toContain(1000);
            expect(page.sql).not.toMatch(/\boffset\b/i);
        }
        for (const statement of [
            'SET TRANSACTION READ ONLY',
            "SET LOCAL statement_timeout = '10s'",
            "SET LOCAL lock_timeout = '1s'",
        ]) {
            expect(
                tracker.history.all.filter(({ sql }) => sql === statement),
            ).toHaveLength(tracker.history.select.length);
        }
        expect(
            tracker.history.transactions.every(
                (transaction) => transaction.state === 'committed',
            ),
        ).toBe(true);
    });
    it.each([
        [
            'analytics_chart_views',
            'saved_queries',
            'chart_uuid',
            'saved_query_uuid',
            'analytics_chart_view_uuid',
        ],
        [
            'analytics_dashboard_views',
            'dashboards',
            'dashboard_uuid',
            'dashboard_uuid',
            'analytics_dashboard_view_uuid',
        ],
    ])(
        'pages %s by content and precise timestamp, resetting the cursor for each content',
        async (table, contentTable, contentColumn, contentKey, viewKey) => {
            tracker.reset();
            tracker.on.any(/^SET /i).response([]);
            const firstContent = '00000000-0000-0000-0000-000000000004';
            const secondContent = '00000000-0000-0000-0000-000000000005';
            const contentQuery = ({ sql }: { sql: string }) =>
                sql.includes(`from "${contentTable}" as "c"`);
            tracker.on
                .select(contentQuery)
                .responseOnce([
                    { content_id: firstContent },
                    { content_id: secondContent },
                ]);
            tracker.on.select(contentQuery).response([]);
            tracker.on
                .select(({ sql }) =>
                    sql.includes(
                        `from "${contentTable === 'saved_queries' ? 'dashboards' : 'saved_queries'}" as "c"`,
                    ),
                )
                .response([]);
            emptySources(table);
            const first = storedRow({
                source_id: '00000000-0000-0000-0000-000000001000',
                event_ts: '2026-09-01T15:04:05.123456Z',
            });
            const fullPage = Array.from({ length: 1000 }, (_, index) =>
                storedRow({
                    source_id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
                }),
            );
            const tied = storedRow({
                source_id: '00000000-0000-0000-0000-000000001001',
                event_ts: first.event_ts,
            });
            const later = storedRow({
                source_id: '00000000-0000-0000-0000-000000000001',
                event_ts: '2026-09-01T15:04:05.123457Z',
            });
            tracker.on.select(matches(table)).responseOnce(fullPage);
            tracker.on.select(matches(table)).responseOnce([tied, later]);
            tracker.on.select(matches(table)).responseOnce([]);
            tracker.on
                .select(matches(table))
                .responseOnce([storedRow({ content_id: secondContent })]);
            tracker.on.select(matches(table)).response([]);
            const rows = await collect();
            expect(rows.map(({ event_ts }) => event_ts)).toEqual([
                ...fullPage.map(({ event_ts }) => event_ts),
                tied.event_ts,
                later.event_ts,
                first.event_ts,
            ]);
            const pages = tracker.history.select.filter(matches(table));
            expect(pages).toHaveLength(5);
            for (const { sql, bindings } of pages) {
                expect(normalizeSql(sql)).toContain(
                    `"h"."${contentColumn}" = ?`,
                );
                expect(sql).toContain(
                    `order by "h"."timestamp" asc, "h"."${viewKey}" asc`,
                );
                expect(bindings).toContain(1000);
            }
            expect(pages[0].bindings).toContain(firstContent);
            expect(normalizeSql(pages[1].sql)).toContain(
                `("h"."timestamp", "h"."${viewKey}") > (?, ?)`,
            );
            expect(pages[1].bindings).toContain(first.event_ts);
            expect(pages[1].bindings).toContain(first.source_id);
            expect(pages[2].bindings).toContain(later.event_ts);
            expect(pages[2].bindings).toContain(later.source_id);
            expect(pages[3].bindings).toContain(secondContent);
            expect(normalizeSql(pages[3].sql)).not.toContain(') > (?, ?)');
            const contentPages = tracker.history.select.filter(contentQuery);
            expect(normalizeSql(contentPages[1].sql)).toContain(
                `"c"."${contentKey}" > ?`,
            );
            expect(contentPages[1].bindings).toContain(secondContent);
        },
    );
});
