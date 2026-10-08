import { QueryExecutionContext } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    DepartmentAnalyticsModel,
    INTERACTIVE_QUERY_CONTEXTS,
} from './DepartmentAnalyticsModel';

describe('DepartmentAnalyticsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DepartmentAnalyticsModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('returns no activity for an empty user set without querying', async () => {
        expect(await model.getWeeklyActivity('org', [], 12)).toEqual([]);
        expect(await model.getActiveUserUuids('org', [], 30)).toEqual([]);
        expect(tracker.history.all).toHaveLength(0);
    });

    it('maps weekly rows to camelCase', async () => {
        tracker.on.any(/analytics_chart_views/).responseOnce({
            rows: [{ user_uuid: 'u1', week_start: '2026-09-28' }],
        });
        expect(await model.getWeeklyActivity('org', ['u1'], 12)).toEqual([
            { userUuid: 'u1', weekStart: '2026-09-28' },
        ]);
    });

    it('scopes query history to the organization and passes users as one array binding', async () => {
        tracker.on
            .any(/query_history/)
            .responseOnce({ rows: [{ user_uuid: 'u1' }] });
        expect(await model.getActiveUserUuids('org', ['u1', 'u2'], 30)).toEqual(
            ['u1'],
        );
        const [query] = tracker.history.all;
        expect(query.bindings[0]).toBe('org');
        expect(query.bindings[1]).toEqual(['u1', 'u2']);
    });

    it('returns no member activity for an empty user set without querying', async () => {
        expect(await model.getMemberActivity('org', [], 30)).toEqual([]);
        expect(tracker.history.all).toHaveLength(0);
    });

    it('maps member activity, keeping never-active people as null', async () => {
        const lastActive = new Date('2026-10-01T09:00:00Z');
        tracker.on.any(/unnest/).responseOnce({
            rows: [
                {
                    user_uuid: 'u1',
                    last_active_at: lastActive,
                    queries_30d: 4,
                    dashboard_views_30d: 2,
                },
                {
                    user_uuid: 'u2',
                    last_active_at: null,
                    queries_30d: 0,
                    dashboard_views_30d: 0,
                },
            ],
        });
        expect(await model.getMemberActivity('org', ['u1', 'u2'], 30)).toEqual([
            {
                userUuid: 'u1',
                lastActiveAt: lastActive,
                queries30d: 4,
                dashboardViews30d: 2,
            },
            {
                userUuid: 'u2',
                lastActiveAt: null,
                queries30d: 0,
                dashboardViews30d: 0,
            },
        ]);
    });

    it('limits member activity to the organization on every source table', async () => {
        tracker.on.any(/unnest/).responseOnce({ rows: [] });
        await model.getMemberActivity('org', ['u1'], 30);
        const [query] = tracker.history.all;
        const orgBindings = query.bindings.filter((b) => b === 'org');
        // query_history, dashboard views and chart views each bind the organization
        expect(orgBindings).toHaveLength(3);
        expect(query.sql).toMatch(/o\.organization_uuid = \$\d/);
        expect(query.sql).toMatch(/WHERE organization_uuid = \$\d/);
        expect(query.sql).toContain('JOIN organizations o');
    });

    describe('interactive query contexts', () => {
        it('lists what a person runs and nothing a schedule, API client, agent or MCP runs', () => {
            expect(INTERACTIVE_QUERY_CONTEXTS).toEqual(
                expect.arrayContaining([
                    QueryExecutionContext.EXPLORE,
                    QueryExecutionContext.DASHBOARD,
                    QueryExecutionContext.CHART,
                    QueryExecutionContext.SQL_RUNNER,
                ]),
            );
            [
                QueryExecutionContext.SCHEDULED_DELIVERY,
                QueryExecutionContext.SCHEDULED_CHART,
                QueryExecutionContext.SCHEDULED_DASHBOARD,
                QueryExecutionContext.ALERT,
                QueryExecutionContext.GSHEETS,
                QueryExecutionContext.API,
                QueryExecutionContext.AI,
                QueryExecutionContext.MCP_RUN_SQL,
                QueryExecutionContext.AUTOREFRESHED_DASHBOARD,
            ].forEach((context) =>
                expect(INTERACTIVE_QUERY_CONTEXTS).not.toContain(context),
            );
        });

        it('filters the activity read to interactive contexts', async () => {
            tracker.on.any(/query_history/).responseOnce({ rows: [] });
            await model.getActiveUserUuids('org', ['u1'], 30);
            const [query] = tracker.history.all;
            expect(query.sql).toMatch(/context = ANY\(\$\d+::text\[\]\)/);
            expect(query.bindings).toContainEqual(INTERACTIVE_QUERY_CONTEXTS);
        });

        it('filters member activity to interactive contexts', async () => {
            tracker.on.any(/unnest/).responseOnce({ rows: [] });
            await model.getMemberActivity('org', ['u1'], 30);
            const [query] = tracker.history.all;
            expect(query.sql).toMatch(/context = ANY\(\$\d+::text\[\]\)/);
            expect(query.bindings).toContainEqual(INTERACTIVE_QUERY_CONTEXTS);
        });

        it('filters top explores to interactive contexts', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            const withoutAi = Object.assign(
                new DepartmentAnalyticsModel({ database }),
                { hasAiTables: async () => false },
            );
            await withoutAi.getTopContent('org', ['u1'], 30, 5);
            const explores = tracker.history.all.find((q) =>
                /exploreName/.test(q.sql),
            );
            expect(explores?.sql).toMatch(
                /qh\.context = ANY\(\$\d+::text\[\]\)/,
            );
            expect(explores?.bindings).toContainEqual(
                INTERACTIVE_QUERY_CONTEXTS,
            );
        });
    });

    describe('getTopContent', () => {
        // Stand in for the schema check so each branch is exercised directly
        const modelWithAiTables = (exists: boolean) =>
            Object.assign(new DepartmentAnalyticsModel({ database }), {
                hasAiTables: async () => exists,
            });
        const item = { id: 'x', name: 'X', count: 3, distinct_people: 2 };
        const mapped = { id: 'x', name: 'X', count: 3, distinctPeople: 2 };

        it('returns empty lists for an empty user set without querying', async () => {
            const result = await modelWithAiTables(true).getTopContent(
                'org',
                [],
                30,
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
                30,
                5,
            );
            expect(result).toEqual({
                dashboards: [mapped],
                explores: [],
                aiAgents: [],
            });
            expect(
                tracker.history.all.some((q) => q.sql.includes('ai_prompt')),
            ).toBe(false);
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
                30,
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
            await modelWithAiTables(true).getTopContent('org', ['u1'], 30, 5);
            const find = (re: RegExp) =>
                tracker.history.all.find((q) => re.test(q.sql));
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

        it('passes the user set as one array binding and the limit last', async () => {
            tracker.on
                .any(/analytics_dashboard_views/)
                .responseOnce({ rows: [] });
            tracker.on.any(/exploreName/).responseOnce({ rows: [] });
            await modelWithAiTables(false).getTopContent(
                'org',
                ['u1', 'u2'],
                30,
                5,
            );
            tracker.history.all.forEach((q) => {
                expect(q.bindings[1]).toEqual(['u1', 'u2']);
                expect(q.bindings[q.bindings.length - 1]).toBe(5);
            });
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
