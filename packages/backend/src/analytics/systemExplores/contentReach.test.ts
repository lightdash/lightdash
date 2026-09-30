/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import {
    contentViewsColumns,
    contentViewsProjections,
    type CapturedContentView,
} from '../eventStream/contentViewsStream';
import { contentReachSql } from './contentReach';

const compile = (dimensions: string[], metrics: string[]) =>
    new MetricQueryBuilder({
        explore: createAnalyticsExplores().find(
            (e) => e.name === 'content_reach',
        )!,
        compiledMetricQuery: {
            exploreName: 'content_reach',
            dimensions,
            metrics: metrics.map((m) => `content_reach_${m}`),
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            compiledTableCalculations: [],
            compiledAdditionalMetrics: [],
            compiledCustomDimensions: [],
        },
        warehouseSqlBuilder: warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB),
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery().query;

export const backendView = (
    id: string,
    day: string,
    verified: boolean | null = false,
): CapturedContentView => ({
    event: 'dashboard.view',
    userId: 'reader',
    properties: {
        organizationId: 'org',
        projectId: 'project',
        contentView: {
            eventId: id,
            occurredAt: `${day}T12:00:00Z`,
            contentId: 'dashboard',
            contentType: 'dashboard',
            contentName: 'Revenue',
            projectName: 'Demo',
            spaceId: 'space',
            spaceName: 'Shared',
            createdAt: '2026-09-01T10:00:00Z',
            isVerified: verified,
            context: 'backend',
            actorType: 'user',
        },
    },
});

describe('Content reach', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:');
        db = await instance.connect();
        await db.run(
            `CREATE TABLE content_views (${contentViewsColumns.map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
        );
        await db.run(
            'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR)',
        );
        await db.run(
            "INSERT INTO lightdash_users VALUES ('org','reader','Alex'), ('other','reader','Other tenant')",
        );
        const first = backendView('one', '2026-09-01');
        const preview = backendView('preview', '2026-09-09');
        preview.properties.contentView.context = 'preview';
        const unknownVerification = backendView('sql', '2026-09-09', null);
        unknownVerification.userId = 'sql-reader';
        for (const event of [
            first,
            first,
            backendView('reload', '2026-09-01'),
            backendView('two', '2026-09-02', true),
            backendView('week-two', '2026-09-09', true),
            preview,
            unknownVerification,
        ]) {
            const { row } = contentViewsProjections[event.event](event)!;
            const statement = await db.prepare(
                `INSERT INTO content_views VALUES (${contentViewsColumns.map(() => '?').join(',')})`,
            );
            statement.bind(
                contentViewsColumns.map(
                    ({ name }) =>
                        (row[name] ?? null) as string | number | boolean | null,
                ),
            );
            await statement.run();
            statement.destroySync();
        }
        // Legacy events without capture metadata remain unclassified.
        for (let i = 0; i < 5; i += 1) {
            await db.run(
                "INSERT INTO content_views (org_id,user_id,content_id,event_ts,view_context,is_qualifying) VALUES ('org','reader','tile','2026-09-10','unknown',false)",
            );
        }
    });
    afterAll(() => {
        db?.closeSync();
        instance?.closeSync();
    });
    it('deduplicates IDs, retains legitimate reloads and snapshot verification, excludes previews and unknown fetches', async () => {
        const [row] = (
            await db.runAndReadAll(
                compile(
                    [],
                    [
                        'qualifying_views',
                        'distinct_viewers',
                        'returning_viewers',
                        'first_week_returning_viewers',
                        'verified_viewers',
                        'verified_audience_share',
                        'last_viewed_at',
                    ],
                ),
            )
        ).getRowObjectsJson();
        expect(row).toMatchObject({
            content_reach_qualifying_views: '5',
            content_reach_distinct_viewers: '2',
            content_reach_returning_viewers: '1',
            content_reach_first_week_returning_viewers: '1',
            content_reach_verified_viewers: '1',
            content_reach_verified_audience_share: 1,
        });
        expect(String(row.content_reach_last_viewed_at)).toContain(
            '2026-09-09',
        );
    });
    it('does not use future visits to classify earlier visits as returning', async () => {
        const rows = (
            await db.runAndReadAll(
                `SELECT count(returning_viewer_id) AS n FROM ${contentReachSql} WHERE event_ts < '2026-09-02'`,
            )
        ).getRowObjectsJson();
        expect(rows).toEqual([{ n: '0' }]);
        expect(
            (
                await db.runAndReadAll(
                    `SELECT count(returning_viewer_id) AS n FROM ${contentReachSql} WHERE event_ts >= '2026-09-09'`,
                )
            ).getRowObjectsJson(),
        ).toEqual([{ n: '1' }]);
    });
    it('executes combinations of time, content, user, verification and cohort dimensions without fanout', async () => {
        const metrics = [
            'qualifying_views',
            'distinct_viewers',
            'returning_viewers',
            'first_week_returning_viewers',
            'verified_viewers',
            'verified_audience_share',
            'last_viewed_at',
        ];
        for (const dimensions of [
            [],
            ['lightdash_users_name'],
            ['content_reach_event_ts_day'],
            [
                'content_reach_content_type',
                'content_reach_content_name',
                'content_reach_space_name',
            ],
            [
                'content_reach_creation_week_week',
                'content_reach_weeks_since_creation',
            ],
            ['content_reach_is_verified', 'content_reach_view_context'],
            [
                'lightdash_users_name',
                'content_reach_event_ts_day',
                'content_reach_project_name',
            ],
        ]) {
            for (const selected of [...metrics.map((m) => [m]), metrics]) {
                const rows = (
                    await db.runAndReadAll(compile(dimensions, selected))
                ).getRowObjectsJson();
                if (selected.includes('qualifying_views'))
                    expect(
                        rows.reduce(
                            (sum, row) =>
                                sum +
                                Number(row.content_reach_qualifying_views),
                            0,
                        ),
                    ).toBe(5);
            }
        }
    });
    it('supports empty tenants', async () => {
        await db.run('DELETE FROM content_views');
        expect(
            (
                await db.runAndReadAll(
                    compile(
                        [],
                        ['qualifying_views', 'verified_audience_share'],
                    ),
                )
            ).getRowObjectsJson(),
        ).toEqual([
            {
                content_reach_qualifying_views: '0',
                content_reach_verified_audience_share: null,
            },
        ]);
    });
});
