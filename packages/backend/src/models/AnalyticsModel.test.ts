import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { AnalyticsModel } from './AnalyticsModel';
import { usersInProjectSql } from './AnalyticsModelSql';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';

describe('AnalyticsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AnalyticsModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('detailed view statistics', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2025-03-01T10:00:00Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it.each([
            ['chart', 'chart_uuid', () => model.getChartViewStats(projectUuid)],
            [
                'dashboard',
                'dashboard_uuid',
                () => model.getDashboardViewStats(projectUuid),
            ],
        ])(
            'returns detailed %s view statistics with a zero-filled daily trend',
            async (_resourceType, uuidColumn, getStats) => {
                tracker.on
                    .select(
                        new RegExp(
                            `count\\(distinct "user_uuid"\\).*where "${uuidColumn}" =`,
                            'is',
                        ),
                    )
                    .response([
                        {
                            views: '12',
                            unique_viewer_count: '4',
                            anonymous_view_count: '2',
                            first_viewed_at: new Date('2025-01-01'),
                        },
                    ]);
                tracker.on
                    .select(
                        new RegExp(
                            `where "${uuidColumn}" = .* and "timestamp" >= .* group by "day"`,
                            'is',
                        ),
                    )
                    .response([
                        { day: '2025-02-27', views: '3' },
                        { day: '2025-03-01', views: '1' },
                    ]);

                const stats = await getStats();

                expect(stats).toMatchObject({
                    views: 12,
                    uniqueViewerCount: 4,
                    anonymousViewCount: 2,
                    firstViewedAt: new Date('2025-01-01'),
                });
                expect(stats.dailyViews).toHaveLength(30);
                expect(stats.dailyViews[0]).toEqual({
                    date: '2025-01-31',
                    views: 0,
                });
                expect(stats.dailyViews[27]).toEqual({
                    date: '2025-02-27',
                    views: 3,
                });
                expect(stats.dailyViews[28]).toEqual({
                    date: '2025-02-28',
                    views: 0,
                });
                expect(stats.dailyViews[29]).toEqual({
                    date: '2025-03-01',
                    views: 1,
                });

                const trendQuery = tracker.history.select.find((query) =>
                    query.sql.includes('group by "day"'),
                );
                expect(trendQuery?.bindings).toContain('2025-01-31');
            },
        );
    });

    it('includes organization custom-role users in the project population', () => {
        const sql = usersInProjectSql(projectUuid, organizationUuid).replace(
            /\s+/g,
            ' ',
        );

        expect(sql).toContain(
            "organization_memberships.role != 'member' OR organization_memberships.role_uuid IS NOT NULL",
        );
    });

    it('skips user-filtered queries when the project population is empty', async () => {
        tracker.on
            .any(/DISTINCT ON \(users\.user_uuid\)/i)
            .response({ rows: [] });
        tracker.on
            .any(/100 \* COUNT\(DISTINCT\(user_uuid\)\) \/ 0/i)
            .response({ rows: [{ count: '0' }] });
        tracker.on
            .any(/FROM public\.analytics_dashboard_views dv/i)
            .response({ rows: [] });
        tracker.on.any(/WITH RankedResults AS/i).response({ rows: [] });
        tracker.on
            .any(/FROM public\.analytics_chart_views/i)
            .response({ rows: [] });
        tracker.on.any(() => true).response({ rows: [] });

        await expect(
            model.getUserActivity(projectUuid, organizationUuid),
        ).resolves.toEqual({
            numberUsers: 0,
            numberInteractiveViewers: 0,
            numberViewers: 0,
            numberEditors: 0,
            numberAdmins: 0,
            numberWeeklyQueryingUsers: 0,
            tableMostQueries: [],
            tableMostCreatedCharts: [],
            tableNoQueries: [],
            chartWeeklyQueryingUsers: [],
            chartWeeklyAverageQueries: [],
            dashboardViews: [],
            userMostViewedDashboards: [],
            chartViews: [],
        });

        const executedSql = tracker.history.all.map((query) => query.sql);
        expect(executedSql).toHaveLength(4);
        expect(executedSql).not.toEqual(
            expect.arrayContaining([
                expect.stringContaining("user_uuid in ('')"),
            ]),
        );
        expect(executedSql).not.toEqual(
            expect.arrayContaining([expect.stringContaining('/ 0')]),
        );
    });
});
