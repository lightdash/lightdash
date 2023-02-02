import { Knex } from 'knex';

export const SchedulerTableName = 'scheduler';
export const SchedulerSlackTargetTableName = 'scheduler_slack_target';

export type SchedulerDb = {
    scheduler_uuid: string;
    name: string;
    created_at: Date;
    updated_at: Date;
    user_uuid: string;
    cron: string;
    saved_chart_uuid: string | null;
    dashboard_uuid: string | null;
};

export type ChartSchedulerDb = SchedulerDb & {
    saved_chart_uuid: string;
    dashboard_uuid: null;
};
export type DashboardSchedulerDB = SchedulerDb & {
    saved_chart_uuid: null;
    dashboard_uuid: string;
};

export type SchedulerSlackTargetDb = {
    scheduler_slack_target_uuid: string;
    created_at: Date;
    updated_at: Date;
    scheduler_uuid: string; // secondary key to scheduler table
    channels: string[]; // slack channel ids
};

export type SchedulerTable = Knex.CompositeTableType<
    SchedulerDb,
    Omit<
        ChartSchedulerDb | DashboardSchedulerDB,
        'scheduler_uuid' | 'created_at'
    >,
    Pick<SchedulerDb, 'name' | 'updated_at' | 'cron'>
>;

export type SchedulerSlackTargetTable = Knex.CompositeTableType<
    SchedulerSlackTargetDb,
    Omit<SchedulerSlackTargetDb, 'scheduler_slack_target_uuid' | 'created_at'>,
    Pick<SchedulerSlackTargetDb, 'channels' | 'updated_at'>
>;
