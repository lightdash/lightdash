import {
    ChartKind,
    DefaultSupportedDbtVersion,
    ProjectType,
    QueryExecutionContext,
    ResultsCacheMissReason,
    ResultsCacheStatsMissReason,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../testing/migratedDatabase';
import { QueryHistoryModel } from './QueryHistoryModel';

vi.mock('../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

const MINUTE = 60 * 1000;
const thresholds = {
    scheduledContexts: [QueryExecutionContext.SCHEDULED_DELIVERY],
    minMisses: 2,
    minShareOfRuns: 0.2,
    minWarehouseTimeMs: 1000,
};

describe('QueryHistoryModel results cache stats', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: QueryHistoryModel;
    let organizationUuid: string;
    let projectUuid: string;
    let chartUuid: string;

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, {
            min: 0,
            max: 1,
            acquireTimeoutMillis: 1500,
        });
        database = migrated.database;
        model = new QueryHistoryModel({ database });
        const [org] = await database('organizations')
            .insert({ organization_name: `cache stats ${randomUUID()}` })
            .returning(['organization_id', 'organization_uuid']);
        organizationUuid = org.organization_uuid;
        const [{ user_uuid: userUuid }] = await database('users')
            .insert({
                first_name: 'Cache',
                last_name: 'Admin',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('user_uuid');
        const [project] = await database('projects')
            .insert({
                name: 'cache stats',
                organization_id: org.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
        projectUuid = project.project_uuid;
        const [{ space_id: spaceId }] = await database('spaces')
            .insert({
                name: 'Reports',
                slug: 'reports',
                path: 'reports',
                project_id: project.project_id,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('space_id');
        [{ saved_query_uuid: chartUuid }] = await database('saved_queries')
            .insert({
                name: 'Revenue',
                description: undefined,
                slug: 'revenue',
                last_version_chart_kind: ChartKind.TABLE,
                last_version_updated_by_user_uuid: userUuid,
                color_palette_uuid: null,
                project_uuid: projectUuid,
                space_id: spaceId,
                dashboard_uuid: null,
            })
            .returning('saved_query_uuid');
    });
    afterAll(async () => {
        await migrated?.destroy();
    });
    beforeEach(async () => {
        await database('query_history')
            .where('project_uuid', projectUuid)
            .delete();
    });

    const insertRun = async ({
        minutesAgo,
        cacheKey = 'key-a',
        hit = false,
        fileName = `file-${randomUUID()}`,
        warehouseMs = 2000,
        reason = null,
        refresh = false,
        context = QueryExecutionContext.CHART,
        status = 'ready',
        withChart = true,
    }: {
        minutesAgo: number;
        cacheKey?: string;
        hit?: boolean;
        fileName?: string;
        warehouseMs?: number;
        reason?: ResultsCacheMissReason | null;
        refresh?: boolean;
        context?: QueryExecutionContext;
        status?: string;
        withChart?: boolean;
    }) => {
        const createdAt = new Date(Date.now() - minutesAgo * MINUTE);
        await database<Record<string, unknown>>('query_history').insert({
            project_uuid: projectUuid,
            organization_uuid: organizationUuid,
            context,
            compiled_sql: 'select 1',
            metric_query: { exploreName: 'orders' },
            fields: {},
            request_parameters: withChart ? { chartUuid } : {},
            status,
            cache_key: cacheKey,
            created_at: createdAt,
            results_file_name: fileName,
            results_created_at: hit
                ? new Date(createdAt.getTime() - MINUTE)
                : new Date(createdAt.getTime() + 1000),
            warehouse_execution_time_ms: hit ? 0 : warehouseMs,
            cache_miss_reason: reason,
            cache_refresh_requested: refresh,
        });
        return fileName;
    };

    test('counts hits, misses, time saved, and excludes bypassed and errored runs', async () => {
        const produced = await insertRun({ minutesAgo: 60, warehouseMs: 5000 });
        await insertRun({ minutesAgo: 30, hit: true, fileName: produced });
        await insertRun({ minutesAgo: 20, cacheKey: 'key-a.random' });
        await insertRun({
            minutesAgo: 10,
            reason: ResultsCacheMissReason.BYPASSED,
        });
        await insertRun({ minutesAgo: 5, status: 'error' });

        const rows = await model.getResultsCacheContextStats(projectUuid, 7);

        expect(rows).toEqual([
            {
                context: QueryExecutionContext.CHART,
                runs: 2,
                hits: 1,
                warehouseTimeOnMissesMs: 5000,
                warehouseTimeSavedMs: 5000,
            },
        ]);
    });

    test('recommendations only include actionable groups that pass the bar', async () => {
        await insertRun({
            minutesAgo: 50,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        await insertRun({
            minutesAgo: 40,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        await insertRun({
            minutesAgo: 30,
            reason: ResultsCacheMissReason.NO_CACHED_RESULT,
        });
        await insertRun({
            minutesAgo: 25,
            refresh: true,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        await insertRun({
            minutesAgo: 20,
            refresh: true,
            reason: null,
            context: QueryExecutionContext.SCHEDULED_DELIVERY,
        });
        await insertRun({ minutesAgo: 10, hit: true });

        const rows = await model.getResultsCacheRecommendationRows(
            projectUuid,
            7,
            thresholds,
        );

        expect(rows).toEqual([
            {
                reason: ResultsCacheStatsMissReason.EXPIRED,
                chartKind: 'chart',
                target: chartUuid,
                name: 'Revenue',
                slug: null,
                misses: 2,
                warehouseTimeMs: 4000,
            },
        ]);
    });

    test('a scheduled refresh that skipped a valid result is recommended', async () => {
        for (const minutesAgo of [50, 40, 30]) {
            // eslint-disable-next-line no-await-in-loop
            await insertRun({
                minutesAgo,
                refresh: true,
                reason: null,
                context: QueryExecutionContext.SCHEDULED_DELIVERY,
            });
        }
        const rows = await model.getResultsCacheRecommendationRows(
            projectUuid,
            7,
            thresholds,
        );
        expect(rows.map((row) => row.reason)).toEqual([
            ResultsCacheStatsMissReason.SCHEDULED_REFRESH,
        ]);
    });

    test('groups below the share-of-runs bar are hidden', async () => {
        await insertRun({
            minutesAgo: 50,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        await insertRun({
            minutesAgo: 45,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        for (let i = 0; i < 10; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await insertRun({ minutesAgo: 40 - i, hit: true });
        }
        await expect(
            model.getResultsCacheRecommendationRows(projectUuid, 7, thresholds),
        ).resolves.toEqual([]);
    });

    test('a group with exactly minMisses passes and one fewer is hidden', async () => {
        await insertRun({
            minutesAgo: 50,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        await insertRun({
            minutesAgo: 40,
            reason: ResultsCacheMissReason.EXPIRED,
        });
        await insertRun({
            minutesAgo: 30,
            reason: ResultsCacheMissReason.EXPIRED,
            withChart: false,
        });

        const rows = await model.getResultsCacheRecommendationRows(
            projectUuid,
            7,
            thresholds,
        );

        expect(rows.map((row) => [row.chartKind, row.misses])).toEqual([
            ['chart', 2],
        ]);
    });

    test('a group with exactly minWarehouseTimeMs passes and 1 ms less is hidden', async () => {
        await insertRun({
            minutesAgo: 50,
            reason: ResultsCacheMissReason.EXPIRED,
            warehouseMs: 500,
        });
        await insertRun({
            minutesAgo: 40,
            reason: ResultsCacheMissReason.EXPIRED,
            warehouseMs: 500,
        });
        await insertRun({
            minutesAgo: 30,
            reason: ResultsCacheMissReason.EXPIRED,
            warehouseMs: 500,
            withChart: false,
        });
        await insertRun({
            minutesAgo: 20,
            reason: ResultsCacheMissReason.EXPIRED,
            warehouseMs: 499,
            withChart: false,
        });

        const rows = await model.getResultsCacheRecommendationRows(
            projectUuid,
            7,
            thresholds,
        );

        expect(rows.map((row) => [row.chartKind, row.warehouseTimeMs])).toEqual(
            [['chart', 1000]],
        );
    });

    test('replay rows only cover keys with a miss after another run, ordered by key and time', async () => {
        await insertRun({ minutesAgo: 50, cacheKey: 'single' });
        await insertRun({ minutesAgo: 40, cacheKey: 'all-hits', hit: true });
        await insertRun({ minutesAgo: 30, cacheKey: 'all-hits', hit: true });
        await insertRun({ minutesAgo: 20, cacheKey: 'replayed' });
        await insertRun({
            minutesAgo: 10,
            cacheKey: 'replayed',
            refresh: true,
            reason: ResultsCacheMissReason.EXPIRED,
        });

        const { totals, runs } = await model.getResultsCacheTtlReplayRows(
            projectUuid,
            30,
            100,
        );

        expect(totals).toEqual({ runs: 5, hits: 2 });
        expect(runs.map((r) => [r.cacheKey, r.forcedMiss])).toEqual([
            ['replayed', false],
            ['replayed', true],
        ]);
    });
    test('runs made while caching was off are replayed but not counted as served', async () => {
        await insertRun({
            minutesAgo: 30,
            cacheKey: 'off',
            reason: ResultsCacheMissReason.CACHE_DISABLED,
        });
        await insertRun({
            minutesAgo: 20,
            cacheKey: 'off',
            reason: ResultsCacheMissReason.CACHE_DISABLED,
        });

        await expect(
            model.getResultsCacheContextStats(projectUuid, 7),
        ).resolves.toEqual([]);
        const { totals, runs } = await model.getResultsCacheTtlReplayRows(
            projectUuid,
            7,
            100,
        );
        expect(totals).toEqual({ runs: 2, hits: 0 });
        expect(runs.map((r) => [r.cacheKey, r.forcedMiss])).toEqual([
            ['off', false],
            ['off', false],
        ]);
    });
});
