import { QueryExecutionContext, TimeoutError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DatabaseError } from 'pg';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    COUNTED_QUERY_CONTEXTS,
    DepartmentAnalyticsModel,
} from './DepartmentAnalyticsModel';

describe('DepartmentAnalyticsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DepartmentAnalyticsModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    const STATEMENT_TIMEOUT = /statement_timeout/;
    // Every read runs after a SET LOCAL in its own transaction; these are the reads themselves
    const reads = () =>
        tracker.history.all.filter((q) => !STATEMENT_TIMEOUT.test(q.sql));
    beforeEach(() => {
        tracker.on.any(STATEMENT_TIMEOUT).response([]);
    });
    afterEach(() => {
        tracker.reset();
    });

    const activeSince = new Date('2026-09-08T12:00:00Z');
    const lastActiveSince = new Date('2026-07-10T12:00:00Z');
    const windows = { activeSince, lastActiveSince };

    it('returns no activity for an empty user set without querying', async () => {
        expect(await model.getActivity('org', [], windows)).toEqual({
            lastActiveAt: new Map(),
            weeklyActivity: [],
        });
        expect(tracker.history.all).toHaveLength(0);
    });

    it("reads each person's latest activity and the weeks they viewed in one query, one row per person", async () => {
        tracker.on.any(/analytics_chart_views/).responseOnce({
            rows: [
                {
                    user_uuid: 'u1',
                    last_active_at: new Date('2026-09-30T10:00:00Z'),
                    week_starts: ['2026-09-28', '2026-08-03'],
                },
                {
                    user_uuid: 'u2',
                    last_active_at: new Date('2026-08-05T10:00:00Z'),
                    week_starts: ['2026-08-03'],
                },
                // A person who only ran queries: in no weekly bucket, but active all the same
                {
                    user_uuid: 'u3',
                    last_active_at: new Date('2026-10-01T10:00:00Z'),
                    week_starts: [],
                },
            ],
        });
        expect(
            await model.getActivity('org', ['u1', 'u2', 'u3'], windows),
        ).toEqual({
            lastActiveAt: new Map([
                ['u1', new Date('2026-09-30T10:00:00Z')],
                ['u2', new Date('2026-08-05T10:00:00Z')],
                ['u3', new Date('2026-10-01T10:00:00Z')],
            ]),
            weeklyActivity: [
                { userUuid: 'u1', weekStart: '2026-09-28' },
                { userUuid: 'u1', weekStart: '2026-08-03' },
                { userUuid: 'u2', weekStart: '2026-08-03' },
            ],
        });
        expect(reads()).toHaveLength(1);
    });

    it('builds the weekly buckets from views only and reads every source back to the at-risk bound', async () => {
        tracker.on.any(/query_history/).responseOnce({ rows: [] });
        await model.getActivity('org', ['u1', 'u2'], windows);
        const [query] = reads();
        expect(query.sql).toMatch(/MAX\(a\.at\) AS last_active_at/);
        // Weeks from views alone, gathered into the person's one row, so query rows are never split by week
        expect(query.sql).toMatch(
            /array_agg\(DISTINCT to_char\(date_trunc\('week', a\.at\), 'YYYY-MM-DD'\)\)\s+FILTER \(WHERE a\.is_view\)/,
        );
        expect(query.sql).toMatch(/GROUP BY a\.user_uuid\s*$/);
        expect(query.sql).toMatch(/qh\.created_at AS at, false AS is_view/);
        expect(
            query.sql.match(/v\.timestamp AS at, true AS is_view/g),
        ).toHaveLength(2);
        // The query history and both view tables go back 90 days, as getMemberActivity reads them
        expect(
            query.bindings.filter((b) => b === lastActiveSince),
        ).toHaveLength(3);
        expect(query.bindings).not.toContain(activeSince);
        const contexts = query.bindings.findIndex(
            (b) => Array.isArray(b) && b === COUNTED_QUERY_CONTEXTS,
        );
        expect(query.bindings[contexts + 1]).toBe(lastActiveSince);
    });

    it('limits every source of the activity read to the organization', async () => {
        tracker.on.any(/query_history/).responseOnce({ rows: [] });
        await model.getActivity('org', ['u1', 'u2'], windows);
        const [query] = reads();
        // query_history binds the organization; the view tables bind the organization's
        // member set, which is the tenancy boundary, on their (user_uuid, timestamp) index
        expect(query.bindings.filter((b) => b === 'org')).toHaveLength(1);
        expect(
            query.bindings.filter(
                (b) => Array.isArray(b) && b[0] === 'u1' && b[1] === 'u2',
            ),
        ).toHaveLength(3);
        expect(query.sql).toMatch(/qh\.organization_uuid = \$\d+/);
        expect(query.sql).toMatch(
            /FROM analytics_chart_views v\s+WHERE v\.user_uuid = ANY\(\$\d+::uuid\[\]\)\s+AND v\.timestamp >= \$\d+/,
        );
        expect(query.sql).toMatch(
            /FROM analytics_dashboard_views v\s+WHERE v\.user_uuid = ANY\(\$\d+::uuid\[\]\)\s+AND v\.timestamp >= \$\d+/,
        );
        // No content join: it made the planner scan once per chart and sort every view to disk
        expect(query.sql).not.toContain('JOIN');
    });

    it('returns no member activity for an empty user set without querying', async () => {
        expect(
            await model.getMemberActivity(
                'org',
                [],
                activeSince,
                lastActiveSince,
            ),
        ).toEqual([]);
        expect(tracker.history.all).toHaveLength(0);
    });

    it('maps member activity, keeping never-active people as null', async () => {
        const lastActive = new Date('2026-10-01T09:00:00Z');
        tracker.on.any(/unnest/).responseOnce({
            rows: [
                {
                    user_uuid: 'u1',
                    last_active_at: lastActive,
                    is_active_30d: true,
                    queries_30d: 4,
                    dashboard_views_30d: 2,
                },
                {
                    user_uuid: 'u2',
                    last_active_at: null,
                    is_active_30d: false,
                    queries_30d: 0,
                    dashboard_views_30d: 0,
                },
            ],
        });
        expect(
            await model.getMemberActivity(
                'org',
                ['u1', 'u2'],
                activeSince,
                lastActiveSince,
            ),
        ).toEqual([
            {
                userUuid: 'u1',
                lastActiveAt: lastActive,
                isActive30d: true,
                queries30d: 4,
                dashboardViews30d: 2,
            },
            {
                userUuid: 'u2',
                lastActiveAt: null,
                isActive30d: false,
                queries30d: 0,
                dashboardViews30d: 0,
            },
        ]);
    });

    it('limits member activity to the organization on every source table', async () => {
        tracker.on.any(/unnest/).responseOnce({ rows: [] });
        await model.getMemberActivity(
            'org',
            ['u1'],
            activeSince,
            lastActiveSince,
        );
        const [query] = reads();
        // query_history binds the organization; both view tables bind the member set
        expect(query.bindings.filter((b) => b === 'org')).toHaveLength(1);
        expect(
            query.bindings.filter((b) => Array.isArray(b) && b[0] === 'u1'),
        ).toHaveLength(4);
        expect(query.sql).toMatch(/WHERE organization_uuid = \$\d/);
        expect(query.sql).toMatch(
            /FROM analytics_dashboard_views v\s+WHERE v\.user_uuid = ANY\(\$\d+::uuid\[\]\)/,
        );
        expect(query.sql).toMatch(
            /FROM analytics_chart_views v\s+WHERE v\.user_uuid = ANY\(\$\d+::uuid\[\]\)/,
        );
        expect(query.sql).not.toContain('JOIN organizations o');
    });

    it('reads every source of member activity back to the 90-day bound only', async () => {
        tracker.on.any(/unnest/).responseOnce({ rows: [] });
        await model.getMemberActivity(
            'org',
            ['u1'],
            activeSince,
            lastActiveSince,
        );
        const [query] = reads();
        const placeholders = query.bindings.flatMap((b, i) =>
            b === lastActiveSince ? [`$${i + 1}`] : [],
        );
        expect(placeholders).toHaveLength(3);
        const [queries, dashboardViews, chartViews] = placeholders;
        // One bound in each source: queries, then dashboard views, then chart views
        const [queryPart, viewParts] = query.sql.split('dv AS (');
        const [dashboardPart, chartPart] = viewParts.split('cv AS (');
        expect(queryPart).toContain(`AND created_at >= ${queries}\n`);
        expect(dashboardPart).toContain(
            `AND v.timestamp >= ${dashboardViews}\n`,
        );
        expect(chartPart).toContain(`AND v.timestamp >= ${chartViews}\n`);
    });

    it('flags a member active from the latest activity and the same 30-day bound', async () => {
        tracker.on.any(/unnest/).responseOnce({ rows: [] });
        await model.getMemberActivity(
            'org',
            ['u1'],
            activeSince,
            lastActiveSince,
        );
        const [query] = reads();
        expect(query.sql).toMatch(
            /COALESCE\(GREATEST\(q\.last_at, dv\.last_at, cv\.last_at\) >= \$\d+, false\) AS is_active_30d/,
        );
        // Recent queries, recent dashboard views and the active flag share one bound
        expect(query.bindings.filter((b) => b === activeSince)).toHaveLength(3);
    });

    describe('counted query contexts', () => {
        const C = QueryExecutionContext;
        // What a person does themselves, plus asking the AI agent or using MCP
        const counted = [
            C.DASHBOARD,
            C.EXPLORE,
            C.CHART,
            C.CHART_HISTORY,
            C.SQL_CHART,
            C.SQL_RUNNER,
            C.COMPOSE_SQL_RUNNER,
            C.VIEW_UNDERLYING_DATA,
            C.METRICS_EXPLORER,
            C.AI,
            C.MCP_RUN_METRIC_QUERY,
            C.MCP_RUN_SQL,
            C.MCP_SEARCH_FIELD_VALUES,
        ];
        // Everything else is deliberately left out; a new context must be added to one list
        const notCounted = [
            C.AUTOREFRESHED_DASHBOARD,
            C.FILTER_AUTOCOMPLETE,
            C.ALERT,
            C.SCHEDULED_DELIVERY,
            C.CSV,
            C.GSHEETS,
            C.GSHEETS_ADDON,
            C.SCHEDULED_GSHEETS_CHART,
            C.SCHEDULED_GSHEETS_DASHBOARD,
            C.SCHEDULED_GSHEETS_SQL_CHART,
            C.SCHEDULED_CHART,
            C.SCHEDULED_DASHBOARD,
            C.CALCULATE_TOTAL,
            C.CALCULATE_SUBTOTAL,
            C.EMBED,
            C.API,
            C.CLI,
            C.PRE_AGGREGATE_MATERIALIZATION,
            C.MULTI_SOURCE_QUERY,
            C.DATA_APP_SAMPLE,
            C.DESKTOP,
        ];

        it('counts exactly the listed contexts', () => {
            expect([...COUNTED_QUERY_CONTEXTS].sort()).toEqual(
                [...counted].sort(),
            );
        });

        it('decides every execution context on purpose', () => {
            const decided = [...counted, ...notCounted];
            expect(new Set(decided).size).toBe(decided.length);
            expect([...decided].sort()).toEqual(
                Object.values(QueryExecutionContext).sort(),
            );
        });

        it('filters the activity read to counted contexts', async () => {
            tracker.on.any(/query_history/).responseOnce({ rows: [] });
            await model.getActivity('org', ['u1'], windows);
            const [query] = reads();
            expect(query.sql).toMatch(/context = ANY\(\$\d+::text\[\]\)/);
            expect(query.bindings).toContainEqual(COUNTED_QUERY_CONTEXTS);
        });

        it('filters member activity to counted contexts', async () => {
            tracker.on.any(/unnest/).responseOnce({ rows: [] });
            await model.getMemberActivity(
                'org',
                ['u1'],
                activeSince,
                lastActiveSince,
            );
            const [query] = reads();
            expect(query.sql).toMatch(/context = ANY\(\$\d+::text\[\]\)/);
            expect(query.bindings).toContainEqual(COUNTED_QUERY_CONTEXTS);
        });

        it('filters top explores to counted contexts', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            const withoutAi = Object.assign(
                new DepartmentAnalyticsModel({ database }),
                { hasAiTables: async () => false },
            );
            await withoutAi.getTopContent('org', ['u1'], activeSince, 5);
            const explores = reads().find((q) => /exploreName/.test(q.sql));
            expect(explores?.sql).toMatch(
                /qh\.context = ANY\(\$\d+::text\[\]\)/,
            );
            expect(explores?.bindings).toContainEqual(COUNTED_QUERY_CONTEXTS);
        });
    });

    describe('getTopContent', () => {
        // Stand in for the schema check so each branch is exercised directly
        const modelWithAiTables = (exists: boolean) =>
            Object.assign(new DepartmentAnalyticsModel({ database }), {
                hasAiTables: async () => exists,
            });
        const item = {
            id: 'x',
            name: 'X',
            project_uuid: 'p',
            count: 3,
            distinct_people: 2,
        };
        const mapped = {
            id: 'x',
            name: 'X',
            projectUuid: 'p',
            count: 3,
            distinctPeople: 2,
        };

        it('returns empty lists for an empty user set without querying', async () => {
            const result = await modelWithAiTables(true).getTopContent(
                'org',
                [],
                activeSince,
                5,
            );
            expect(result).toEqual({
                dashboards: [],
                explores: [],
                aiAgents: [],
            });
            expect(tracker.history.all).toHaveLength(0);
        });

        it('skips the AI query and returns no agents when the AI tables do not exist', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [item] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            const result = await modelWithAiTables(false).getTopContent(
                'org',
                ['u1'],
                activeSince,
                5,
            );
            expect(result).toEqual({
                dashboards: [mapped],
                explores: [],
                aiAgents: [],
            });
            expect(reads().some((q) => q.sql.includes('ai_prompt'))).toBe(
                false,
            );
        });

        it('includes agents when the AI tables exist', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            tracker.on.any(/ai_prompt/).responseOnce({ rows: [item] });
            const result = await modelWithAiTables(true).getTopContent(
                'org',
                ['u1'],
                activeSince,
                5,
            );
            expect(result.aiAgents).toEqual([mapped]);
        });

        it('limits each content read to the organization in SQL', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            tracker.on.any(/ai_prompt/).responseOnce({ rows: [] });
            await modelWithAiTables(true).getTopContent(
                'org',
                ['u1'],
                activeSince,
                5,
            );
            const find = (re: RegExp) => reads().find((q) => re.test(q.sql));
            const dashboards = find(/analytics_dashboard_views/);
            expect(dashboards?.sql).toContain(
                'JOIN organizations o ON o.organization_id = p.organization_id',
            );
            expect(dashboards?.sql).toContain('d.deleted_at IS NULL');
            expect(dashboards?.bindings[0]).toBe('org');
            const explores = find(/exploreName/);
            expect(explores?.sql).toMatch(/qh\.organization_uuid = \$\d/);
            expect(explores?.bindings[0]).toBe('org');
            const agents = find(/ai_prompt/);
            expect(agents?.sql).toMatch(/t\.organization_uuid = \$\d/);
            expect(agents?.bindings[0]).toBe('org');
        });

        it('returns the project of every item, for its link', async () => {
            const explore = {
                id: 'p:orders',
                name: 'orders',
                project_uuid: 'p',
                count: 4,
                distinct_people: 1,
            };
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [item] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [explore] });
            tracker.on.any(/ai_prompt/).responseOnce({ rows: [item] });
            const result = await modelWithAiTables(true).getTopContent(
                'org',
                ['u1'],
                activeSince,
                5,
            );
            expect(result).toEqual({
                dashboards: [mapped],
                // The explore keeps its composite id and carries its project on its own
                explores: [
                    {
                        id: 'p:orders',
                        name: 'orders',
                        projectUuid: 'p',
                        count: 4,
                        distinctPeople: 1,
                    },
                ],
                aiAgents: [mapped],
            });
            const find = (re: RegExp) => reads().find((q) => re.test(q.sql));
            // The dashboard's project through its space, the join that already ties it to the organization
            expect(find(/analytics_dashboard_views/)?.sql).toMatch(
                /p\.project_uuid,[\s\S]*GROUP BY d\.dashboard_uuid, d\.name, p\.project_uuid/,
            );
            const explores = find(/exploreName/)?.sql;
            expect(explores).toMatch(
                /concat\(qh\.project_uuid, ':', qh\.metric_query->>'exploreName'\) AS id/,
            );
            expect(explores).toMatch(/qh\.project_uuid,\s+COUNT/);
            // A query from a deleted project has no project to link to
            expect(explores).toContain('qh.project_uuid IS NOT NULL');
            expect(find(/ai_prompt/)?.sql).toMatch(
                /a\.project_uuid,[\s\S]*GROUP BY a\.ai_agent_uuid, a\.name, a\.project_uuid/,
            );
        });

        it('passes the user set as one array binding and the limit last', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            await modelWithAiTables(false).getTopContent(
                'org',
                ['u1', 'u2'],
                activeSince,
                5,
            );
            reads().forEach((q) => {
                expect(q.bindings[1]).toEqual(['u1', 'u2']);
                expect(q.bindings[q.bindings.length - 1]).toBe(5);
            });
        });
    });

    describe('statement timeout', () => {
        const withoutAi = () =>
            Object.assign(new DepartmentAnalyticsModel({ database }), {
                hasAiTables: async () => false,
            });
        const databaseError = (code: string, message: string) =>
            Object.assign(new DatabaseError(message, 0, 'error'), { code });

        it('runs each read in its own transaction that first sets a 15-second statement timeout', async () => {
            tracker.on.any(/unnest/).response({ rows: [] });
            tracker.on.any(/exploreName/).response({ rows: [] });
            tracker.on.any(/deleted_at IS NULL/).response({ rows: [] });
            tracker.on.any(/MAX\(a\.at\)/).response({ rows: [] });
            await model.getActivity('org', ['u1'], windows);
            await model.getMemberActivity(
                'org',
                ['u1'],
                activeSince,
                lastActiveSince,
            );
            await withoutAi().getTopContent('org', ['u1'], activeSince, 5);

            // Summary activity, member activity, top dashboards and top explores
            const { transactions } = tracker.history;
            expect(transactions).toHaveLength(4);
            transactions.forEach((transaction) => {
                expect(transaction.state).toBe('committed');
                expect(transaction.queries.map((q) => q.sql)).toEqual([
                    'SET LOCAL statement_timeout = 15000',
                    expect.any(String),
                ]);
            });
        });

        it('answers a read cancelled by the statement timeout with a TimeoutError', async () => {
            tracker.on
                .any(/unnest/)
                .simulateError(
                    databaseError(
                        '57014',
                        'canceling statement due to statement timeout',
                    ),
                );
            await expect(
                model.getMemberActivity(
                    'org',
                    ['u1'],
                    activeSince,
                    lastActiveSince,
                ),
            ).rejects.toThrow(
                new TimeoutError(
                    'Adoption figures took too long to load. Try again in a minute',
                ),
            );
            expect(tracker.history.transactions[0].state).toBe('rolled back');
        });

        it('passes any other database error through unchanged', async () => {
            const missingTable = databaseError(
                '42P01',
                'relation does not exist',
            );
            tracker.on.any(/MAX\(a\.at\)/).simulateError(missingTable);
            await expect(
                model.getActivity('org', ['u1'], windows),
            ).rejects.toBe(missingTable);
        });
    });

    describe('hasAiTables', () => {
        const withSchema = (existing: string[]) => {
            const fakeDatabase = {
                schema: {
                    hasTable: async (table: string) => existing.includes(table),
                },
            };
            return new DepartmentAnalyticsModel({
                database: fakeDatabase as never,
            });
        };
        it('is false when any of the three AI tables is missing', async () => {
            expect(
                await withSchema(['ai_prompt', 'ai_thread']).hasAiTables(),
            ).toBe(false);
            expect(await withSchema([]).hasAiTables()).toBe(false);
        });
        it('is true when all three exist', async () => {
            expect(
                await withSchema([
                    'ai_prompt',
                    'ai_thread',
                    'ai_agent',
                ]).hasAiTables(),
            ).toBe(true);
        });
    });
});
