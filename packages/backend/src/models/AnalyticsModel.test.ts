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
        const recentQuery = /"timestamp" >= /i;

        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(now);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        const mockQueries = (
            firstViewedAt: Date | null,
            recentViews: string,
        ) => {
            tracker.on.select(totalsQuery).response([
                {
                    views: '12',
                    unique_viewer_count: '4',
                    anonymous_view_count: '2',
                    first_viewed_at: firstViewedAt,
                },
            ]);
            tracker.on.select(recentQuery).response([{ views: recentViews }]);
        };

        const recentBinding = () =>
            tracker.history.select.find((query) => recentQuery.test(query.sql))
                ?.bindings;

        it.each([
            ['chart', 'chart_uuid', () => model.getChartViewStats(projectUuid)],
            [
                'dashboard',
                'dashboard_uuid',
                () => model.getDashboardViewStats(projectUuid),
            ],
        ])(
            'returns %s totals with a rolling 30-day window for older assets',
            async (_resourceType, uuidColumn, getStats) => {
                mockQueries(new Date('2025-01-01'), '7');

                await expect(getStats()).resolves.toEqual({
                    views: 12,
                    uniqueViewerCount: 4,
                    anonymousViewCount: 2,
                    firstViewedAt: new Date('2025-01-01'),
                    recentViews: { unit: 'day', length: 30, views: 7 },
                });

                const recent = tracker.history.select.find((query) =>
                    recentQuery.test(query.sql),
                );
                expect(recent?.sql).toContain(`where "${uuidColumn}" =`);
                expect(recent?.bindings).toContain('2025-01-31 00:00:00');
            },
        );

        it('shortens the window to the days since the first view', async () => {
            mockQueries(new Date('2025-02-24T18:00:00Z'), '5');

            const stats = await model.getChartViewStats(projectUuid);

            expect(stats.recentViews).toEqual({
                unit: 'day',
                length: 6,
                views: 5,
            });
            expect(recentBinding()).toContain('2025-02-24 00:00:00');
        });

        it('uses the last 24 hours for assets first viewed under two days ago', async () => {
            mockQueries(new Date('2025-02-28T09:00:00Z'), '2');

            const stats = await model.getChartViewStats(projectUuid);

            expect(stats.recentViews).toEqual({
                unit: 'hour',
                length: 24,
                views: 2,
            });
            expect(recentBinding()).toContain('2025-02-28 11:00:00');
        });

        it('falls back to a rolling 30-day window when there are no views', async () => {
            mockQueries(null, '0');

            const stats = await model.getChartViewStats(projectUuid);

            expect(stats.recentViews).toEqual({
                unit: 'day',
                length: 30,
                views: 0,
            });
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
