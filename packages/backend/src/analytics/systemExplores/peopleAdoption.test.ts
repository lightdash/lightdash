/* eslint-disable no-await-in-loop -- A single native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { FilterOperator, WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import Logger from '../../logging/logger';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { peopleMembershipColumns } from '../eventStream/peopleMembership';
import { compactedStreamSchemas } from '../eventStream/registry';
import type { CompactedStreamColumn } from '../eventStream/types';
import { peopleAdoptionMetrics, peopleAdoptionSql } from './peopleAdoption';

const schemas: Record<string, CompactedStreamColumn[]> = {
    lightdash_people: peopleMembershipColumns,
    ...Object.fromEntries(
        [
            'query_events',
            'content_views',
            'agent_request_events',
            'data_app_events',
            'mcp_tool_calls',
        ].map((name) => [
            name,
            compactedStreamSchemas[name as keyof typeof compactedStreamSchemas],
        ]),
    ),
};
const compile = (dimensions: string[], metrics: string[], role?: string) =>
    new MetricQueryBuilder({
        explore: createAnalyticsExplores().find(
            (e) => e.name === 'people_adoption',
        )!,
        compiledMetricQuery: {
            exploreName: 'people_adoption',
            dimensions: dimensions.map((d) => `people_adoption_${d}`),
            metrics: metrics.map((m) => `people_adoption_${m}`),
            filters: role
                ? {
                      dimensions: {
                          id: 'roles',
                          and: [
                              {
                                  id: 'role',
                                  target: {
                                      fieldId:
                                          'people_adoption_organization_role',
                                  },
                                  operator: FilterOperator.EQUALS,
                                  values: [role],
                              },
                          ],
                      },
                  }
                : {},
            sorts: [],
            limit: 1000,
            tableCalculations: [],
            compiledAdditionalMetrics: [],
            compiledTableCalculations: [],
            compiledCustomDimensions: [],
        },
        warehouseSqlBuilder: warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB),
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery().query;

describe('People adoption', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    const insert = async (
        table: string,
        row: Record<string, string | number | boolean | null>,
    ) => {
        const columns = schemas[table];
        const statement = await db.prepare(
            `INSERT INTO ${table} VALUES (${columns.map(() => '?').join(',')})`,
        );
        statement.bind(columns.map(({ name }) => row[name] ?? null));
        await statement.run();
        statement.destroySync();
    };
    const member = (user: string, extra = {}) =>
        insert('lightdash_people', {
            org_id: 'org',
            user_id: user,
            name: 'Same name',
            organization_role: 'member',
            snapshot_at: '2026-10-02 00:30:00',
            is_active: true,
            is_setup_complete: true,
            is_eligible: true,
            group_ids: '["group-a","group-b"]',
            group_names: '["A","B"]',
            ...extra,
        });
    const view = (user: string, date = '2026-10-01 12:00:00', extra = {}) =>
        insert('content_views', {
            org_id: 'org',
            user_id: user,
            project_id: 'project',
            event_ts: date,
            is_qualifying: true,
            actor_type: 'user',
            ...extra,
        });
    const rows = async (sql: string) =>
        (await db.runAndReadAll(sql)).getRowObjectsJson();
    beforeEach(async () => {
        instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '256MB',
            threads: '1',
        });
        db = await instance.connect();
        for (const [name, columns] of Object.entries(schemas))
            await db.run(
                `CREATE TABLE ${name} (${columns.map((c) => `"${c.name}" ${c.type}`).join(',')})`,
            );
    });
    afterEach(() => {
        db.closeSync();
        instance.closeSync();
    });

    it.runIf(process.env.PEOPLE_ADOPTION_LOAD_TEST === 'true')(
        'reduces a million events to distinct people within the configured memory budget',
        async () => {
            await db.run(`INSERT INTO lightdash_people (org_id,user_id,snapshot_at,is_active,is_setup_complete,is_eligible)
            SELECT 'org', n::VARCHAR, TIMESTAMP '2026-10-02 00:30:00', true,true,true FROM range(10000) t(n)`);
            await db.run(`INSERT INTO content_views (org_id,user_id,event_ts,actor_type,is_qualifying)
            SELECT 'org', (n % 8000)::VARCHAR, TIMESTAMP '2026-10-01 12:00:00' - (floor(n / 8000)::INTEGER % 60) * INTERVAL 1 DAY,
            'user',true FROM range(1000000) t(n)`);
            const started = Date.now();
            const result = await rows(
                compile(
                    [],
                    [
                        'eligible_people',
                        'active_people_30d',
                        'adoption_rate_30d',
                    ],
                ),
            );
            expect(result).toEqual([
                {
                    people_adoption_eligible_people: '10000',
                    people_adoption_active_people_30d: '8000',
                    people_adoption_adoption_rate_30d: 0.8,
                },
            ]);
            Logger.info(
                `People adoption load query: 10000 members, 1000000 events, 256MB, 1 thread, ${Date.now() - started}ms`,
            );
        },
    );

    it('retains zero-event members and excludes inactive/pending accounts from adoption', async () => {
        await member('used');
        await member('never');
        await member('inactive', { is_active: false, is_eligible: false });
        await member('pending', {
            is_setup_complete: false,
            is_eligible: false,
        });
        await view('used');
        await view('inactive');
        await view('pending');
        expect(
            await rows(
                compile(
                    [],
                    [
                        'total_members',
                        'eligible_people',
                        'active_people_30d',
                        'adoption_rate_30d',
                        'people_without_observed_activity',
                    ],
                ),
            ),
        ).toEqual([
            {
                people_adoption_total_members: '4',
                people_adoption_eligible_people: '2',
                people_adoption_active_people_30d: '1',
                people_adoption_adoption_rate_30d: 0.5,
                people_adoption_people_without_observed_activity: '1',
            },
        ]);
        const people = await rows(`SELECT * FROM ${peopleAdoptionSql}`);
        expect(people.find((p) => p.user_id === 'never')).toMatchObject({
            activity_status: 'No qualifying activity observed',
            last_observed_activity_at: null,
        });
        expect(people).toHaveLength(4);
    });

    it('classifies human, inferred, scheduled and unknown activity without treating a user ID as intent', async () => {
        for (const user of [
            'human',
            'scheduled',
            'auto',
            'legacy',
            'app',
            'mcp',
            'agent',
            'system',
        ])
            await member(user);
        for (const [user, origin, actor] of [
            ['human', 'interactive', 'user'],
            ['scheduled', 'scheduled', 'user'],
            ['auto', 'autorefresh', 'user'],
            ['legacy', null, null],
            ['system', 'interactive', 'service_account'],
        ])
            await insert('query_events', {
                org_id: 'org',
                user_id: user,
                event_ts: '2026-10-01',
                workload_origin: origin,
                initiating_actor_type: actor,
            });
        await insert('data_app_events', {
            org_id: 'org',
            user_id: 'app',
            event_ts: '2026-10-01',
            event_name: 'data_app.view',
        });
        await insert('mcp_tool_calls', {
            org_id: 'org',
            user_id: 'mcp',
            event_ts: '2026-10-01',
            actor_type: 'user',
        });
        await insert('agent_request_events', {
            org_id: 'org',
            user_id: 'agent',
            event_ts: '2026-10-01',
            prompt_id: 'prompt',
            stage: 'created',
            surface: 'web_app',
        });
        const people = await rows(`SELECT * FROM ${peopleAdoptionSql}`);
        expect(
            people
                .filter((p) => p.active_7d)
                .map((p) => p.user_id)
                .sort(),
        ).toEqual(['agent', 'human']);
        expect(
            people.find((p) => p.user_id === 'app')?.last_inferred_activity_at,
        ).not.toBeNull();
        expect(
            people.find((p) => p.user_id === 'legacy')
                ?.last_unknown_activity_at,
        ).not.toBeNull();
        expect(
            people.find((p) => p.user_id === 'scheduled')
                ?.last_system_activity_at,
        ).not.toBeNull();
        expect(await rows(compile([], ['agent_share_30d']))).toEqual([
            { people_adoption_agent_share_30d: 0.5 },
        ]);
    });

    it('uses fixed closed-day windows and observed return history, excluding current/future days', async () => {
        for (const user of ['returning', 'new', 'lapsed', 'today', 'boundary'])
            await member(user);
        await view('returning', '2026-09-10');
        await view('returning', '2026-10-01');
        await view('new');
        await view('lapsed', '2026-09-01 23:59:59');
        await view('today', '2026-10-02');
        await view('boundary', '2026-09-02');
        expect(
            await rows(
                compile(
                    [],
                    [
                        'active_people_1d',
                        'active_people_7d',
                        'active_people_30d',
                        'returning_people_7d',
                        'lapsed_people_30d',
                    ],
                ),
            ),
        ).toEqual([
            {
                people_adoption_active_people_1d: '2',
                people_adoption_active_people_7d: '2',
                people_adoption_active_people_30d: '3',
                people_adoption_returning_people_7d: '1',
                people_adoption_lapsed_people_30d: '1',
            },
        ]);
    });

    it('does not multiply people across duplicate events, projects or groups; isolates orgs and filters denominators', async () => {
        await member('used', { organization_role: 'admin' });
        await member('unused');
        await view('used');
        await view('used');
        await view('used', '2026-10-01', { project_id: 'another' });
        await view('unused', '2026-10-01', { org_id: 'other' });
        await view('outsider');
        const people = await rows(`SELECT * FROM ${peopleAdoptionSql}`);
        expect(people).toHaveLength(2);
        expect(people.find((p) => p.user_id === 'used')?.active_days_30d).toBe(
            '1',
        );
        expect(
            await rows(
                compile([], ['eligible_people', 'adoption_rate_7d'], 'admin'),
            ),
        ).toEqual([
            {
                people_adoption_eligible_people: '1',
                people_adoption_adoption_rate_7d: 1,
            },
        ]);
        for (const dimensions of [
            [],
            ['name'],
            ['user_id', 'activity_status'],
            ['group_ids', 'organization_role'],
            ['snapshot_at_day', 'is_eligible'],
            ['first_observed_week_week'],
        ]) {
            expect(
                await rows(
                    compile(
                        dimensions,
                        peopleAdoptionMetrics.map((m) => m.name),
                    ),
                ),
            ).not.toHaveLength(0);
        }
    });

    it('returns a null rate for missing inventory or an empty eligible population', async () => {
        expect(
            await rows(compile([], ['eligible_people', 'adoption_rate_30d'])),
        ).toEqual([
            {
                people_adoption_eligible_people: '0',
                people_adoption_adoption_rate_30d: null,
            },
        ]);
        await member('inactive', { is_eligible: false, is_active: false });
        expect(
            await rows(compile([], ['eligible_people', 'adoption_rate_30d'])),
        ).toEqual([
            {
                people_adoption_eligible_people: '0',
                people_adoption_adoption_rate_30d: null,
            },
        ]);
    });
});
