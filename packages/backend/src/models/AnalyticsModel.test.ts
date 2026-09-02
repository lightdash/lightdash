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
        const now = new Date('2025-03-01T10:30:00Z');
        const totalsQuery = /count\(distinct "user_uuid"\)/i;
        const trendQuery = /group by "bucket"/i;

        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(now);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        const mockTotals = (firstViewedAt: Date | null) =>
            tracker.on.select(totalsQuery).response([
                {
                    views: '12',
                    unique_viewer_count: '4',
                    anonymous_view_count: '2',
                    first_viewed_at: firstViewedAt,
                },
            ]);

        it.each([
            ['chart', 'chart_uuid', () => model.getChartViewStats(projectUuid)],
            [
                'dashboard',
                'dashboard_uuid',
                () => model.getDashboardViewStats(projectUuid),
            ],
        ])(
            'returns %s totals with a rolling 30-day daily trend for older assets',
            async (_resourceType, uuidColumn, getStats) => {
                mockTotals(new Date('2025-01-01'));
                tracker.on.select(trendQuery).response([
                    { bucket: '2025-02-27', views: '3' },
                    { bucket: '2025-03-01', views: '1' },
                ]);

                const stats = await getStats();

                expect(stats).toMatchObject({
                    views: 12,
                    uniqueViewerCount: 4,
                    anonymousViewCount: 2,
                    firstViewedAt: new Date('2025-01-01'),
                });
                expect(stats.viewTrend.granularity).toBe('day');
                expect(stats.viewTrend.points).toHaveLength(30);
                expect(stats.viewTrend.points[0]).toEqual({
                    date: '2025-01-31',
                    views: 0,
                });
                expect(stats.viewTrend.points[27]).toEqual({
                    date: '2025-02-27',
                    views: 3,
                });
                expect(stats.viewTrend.points[29]).toEqual({
                    date: '2025-03-01',
                    views: 1,
                });

                const trend = tracker.history.select.find((query) =>
                    trendQuery.test(query.sql),
                );
                expect(trend?.sql).toContain(`where "${uuidColumn}" =`);
                expect(trend?.bindings).toContain('2025-01-31');
            },
        );

        it('shortens the daily trend to the days since the first view', async () => {
            mockTotals(new Date('2025-02-24T18:00:00Z'));
            tracker.on
                .select(trendQuery)
                .response([{ bucket: '2025-02-24', views: '5' }]);

            const stats = await model.getChartViewStats(projectUuid);

            expect(stats.viewTrend.granularity).toBe('day');
            expect(stats.viewTrend.points.map((point) => point.date)).toEqual([
                '2025-02-24',
                '2025-02-25',
                '2025-02-26',
                '2025-02-27',
                '2025-02-28',
                '2025-03-01',
            ]);
            expect(stats.viewTrend.points[0].views).toBe(5);
        });

        it('uses hourly buckets over the last 24 hours for assets first viewed under two days ago', async () => {
            mockTotals(new Date('2025-02-28T09:00:00Z'));
            tracker.on
                .select(trendQuery)
                .response([{ bucket: '2025-03-01T09:00:00Z', views: '2' }]);

            const stats = await model.getChartViewStats(projectUuid);

            expect(stats.viewTrend.granularity).toBe('hour');
            expect(stats.viewTrend.points).toHaveLength(24);
            expect(stats.viewTrend.points[0]).toEqual({
                date: '2025-02-28T11:00:00Z',
                views: 0,
            });
            expect(stats.viewTrend.points[22]).toEqual({
                date: '2025-03-01T09:00:00Z',
                views: 2,
            });
            expect(stats.viewTrend.points[23].date).toBe(
                '2025-03-01T10:00:00Z',
            );

            const trend = tracker.history.select.find((query) =>
                trendQuery.test(query.sql),
            );
            expect(trend?.sql).toContain('HH24');
            expect(trend?.bindings).toContain('2025-02-28 11:00:00');
        });

        it('falls back to a rolling 30-day daily trend when there are no views', async () => {
            mockTotals(null);
            tracker.on.select(trendQuery).response([]);

            const stats = await model.getChartViewStats(projectUuid);

            expect(stats.viewTrend.granularity).toBe('day');
            expect(stats.viewTrend.points).toHaveLength(30);
            expect(
                stats.viewTrend.points.every((point) => point.views === 0),
            ).toBe(true);
        });
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
