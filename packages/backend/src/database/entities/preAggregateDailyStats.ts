import { Knex } from 'knex';

export const PreAggregateDailyStatsTableName = 'pre_aggregate_daily_stats';

export type DbPreAggregateDailyStat = {
    project_uuid: string;
    explore_name: string;
    date: Date;
    chart_uuid: string | null;
    dashboard_uuid: string | null;
    query_context: string;
    hit_count: number;
    miss_count: number;
    miss_reason: string | null;
    pre_aggregate_name: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbPreAggregateDailyStatIn = Omit<
    DbPreAggregateDailyStat,
    'created_at' | 'updated_at'
>;

export type PreAggregateDailyStatsTable = Knex.CompositeTableType<
    DbPreAggregateDailyStat,
    DbPreAggregateDailyStatIn
>;
