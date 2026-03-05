import {
    assertUnreachable,
    type KnexPaginateArgs,
    type KnexPaginatedData,
} from '@lightdash/common';
import { Knex } from 'knex';
import { PreAggregateDailyStatsTableName } from '../database/entities/preAggregateDailyStats';
import KnexPaginate from '../database/pagination';

export type PreAggregateDailyStatsUpsertParams = {
    projectUuid: string;
    exploreName: string;
    chartUuid: string | null;
    dashboardUuid: string | null;
    queryContext: string;
    hit: boolean;
    missReason: string | null;
    preAggregateName: string | null;
};

export type PreAggregateDailyStatRow = {
    projectUuid: string;
    exploreName: string;
    date: Date;
    chartUuid: string | null;
    chartName: string | null;
    dashboardUuid: string | null;
    dashboardName: string | null;
    queryContext: string;
    hitCount: number;
    missCount: number;
    missReason: string | null;
    preAggregateName: string | null;
    updatedAt: Date;
};

type DbJoinedRow = {
    project_uuid: string;
    explore_name: string;
    date: Date;
    chart_uuid: string | null;
    chart_name: string | null;
    dashboard_uuid: string | null;
    dashboard_name: string | null;
    query_context: string;
    hit_count: number;
    miss_count: number;
    miss_reason: string | null;
    pre_aggregate_name: string | null;
    updated_at: Date;
};

function convertDbRow(row: DbJoinedRow): PreAggregateDailyStatRow {
    return {
        projectUuid: row.project_uuid,
        exploreName: row.explore_name,
        date: row.date,
        chartUuid: row.chart_uuid,
        chartName: row.chart_name,
        dashboardUuid: row.dashboard_uuid,
        dashboardName: row.dashboard_name,
        queryContext: row.query_context,
        hitCount: row.hit_count,
        missCount: row.miss_count,
        missReason: row.miss_reason,
        preAggregateName: row.pre_aggregate_name,
        updatedAt: row.updated_at,
    };
}

export class PreAggregateDailyStatsModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async upsert(params: PreAggregateDailyStatsUpsertParams): Promise<void> {
        const hitCount = params.hit ? 1 : 0;
        const missCount = params.hit ? 0 : 1;
        const missReason = !params.hit ? params.missReason : null;

        await this.database.raw(
            `
            INSERT INTO ${PreAggregateDailyStatsTableName}
                (project_uuid, explore_name, date, chart_uuid,
                 dashboard_uuid, query_context,
                 hit_count, miss_count, miss_reason, pre_aggregate_name)
            VALUES (?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (
                project_uuid, explore_name, date, query_context,
                COALESCE(chart_uuid, '00000000-0000-0000-0000-000000000000'),
                COALESCE(dashboard_uuid, '00000000-0000-0000-0000-000000000000')
            )
            DO UPDATE SET
                hit_count = ${PreAggregateDailyStatsTableName}.hit_count + EXCLUDED.hit_count,
                miss_count = ${PreAggregateDailyStatsTableName}.miss_count + EXCLUDED.miss_count,
                miss_reason = COALESCE(EXCLUDED.miss_reason, ${PreAggregateDailyStatsTableName}.miss_reason),
                pre_aggregate_name = COALESCE(EXCLUDED.pre_aggregate_name, ${PreAggregateDailyStatsTableName}.pre_aggregate_name),
                updated_at = NOW()
            `,
            [
                params.projectUuid,
                params.exploreName,
                params.chartUuid,
                params.dashboardUuid,
                params.queryContext,
                hitCount,
                missCount,
                missReason,
                params.preAggregateName,
            ],
        );
    }

    async getByProject(
        projectUuid: string,
        days: number = 3,
        paginateArgs?: KnexPaginateArgs,
        filters?: {
            exploreName?: string;
            queryType?: 'chart' | 'dashboard' | 'explorer';
        },
    ): Promise<KnexPaginatedData<PreAggregateDailyStatRow[]>> {
        const stats = PreAggregateDailyStatsTableName;
        const query = this.database(stats)
            .select(
                `${stats}.project_uuid`,
                `${stats}.explore_name`,
                `${stats}.date`,
                `${stats}.chart_uuid`,
                this.database.raw('sq.name as chart_name'),
                `${stats}.dashboard_uuid`,
                this.database.raw('d.name as dashboard_name'),
                `${stats}.query_context`,
                `${stats}.hit_count`,
                `${stats}.miss_count`,
                `${stats}.miss_reason`,
                `${stats}.pre_aggregate_name`,
                `${stats}.updated_at`,
            )
            .leftJoin('saved_queries as sq', function getChartJoin() {
                this.on(
                    'sq.saved_query_uuid',
                    '=',
                    `${stats}.chart_uuid`,
                ).andOnNull('sq.deleted_at');
            })
            .leftJoin('dashboards as d', function getDashboardJoin() {
                this.on(
                    'd.dashboard_uuid',
                    '=',
                    `${stats}.dashboard_uuid`,
                ).andOnNull('d.deleted_at');
            })
            .where(`${stats}.project_uuid`, projectUuid)
            .where(
                `${stats}.date`,
                '>=',
                this.database.raw(`CURRENT_DATE - ? * INTERVAL '1 day'`, [
                    days,
                ]),
            )
            .orderBy(`${stats}.updated_at`, 'desc');

        if (filters?.exploreName) {
            void query.where(`${stats}.explore_name`, filters.exploreName);
        }

        if (filters?.queryType) {
            switch (filters.queryType) {
                case 'chart':
                    void query
                        .whereNotNull(`${stats}.chart_uuid`)
                        .whereNull(`${stats}.dashboard_uuid`);
                    break;
                case 'dashboard':
                    void query.whereNotNull(`${stats}.dashboard_uuid`);
                    break;
                case 'explorer':
                    void query
                        .whereNull(`${stats}.chart_uuid`)
                        .whereNull(`${stats}.dashboard_uuid`);
                    break;
                default:
                    return assertUnreachable(
                        filters.queryType,
                        'Invalid query type',
                    );
            }
        }

        const result = await KnexPaginate.paginate(query, paginateArgs);
        return {
            data: (result.data as unknown as DbJoinedRow[]).map(convertDbRow),
            pagination: result.pagination,
        };
    }

    async cleanup(retentionDays: number = 3): Promise<number> {
        const deleted = await this.database(PreAggregateDailyStatsTableName)
            .where(
                'date',
                '<',
                this.database.raw(`CURRENT_DATE - ? * INTERVAL '1 day'`, [
                    retentionDays,
                ]),
            )
            .delete();

        return deleted;
    }
}
