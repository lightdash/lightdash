import {
    AnyType,
    assertUnreachable,
    isEmailTarget,
    isGoogleChatTarget,
    isMsTeamsTarget,
    isSlackTarget,
    SchedulerEmailTarget,
    SchedulerGoogleChatTarget,
    SchedulerMsTeamsTarget,
    SchedulerSlackTarget,
} from '@lightdash/common';
import { Knex } from 'knex';

export const SchedulerTableName = 'scheduler';
export const SchedulerSlackTargetTableName = 'scheduler_slack_target';
export const SchedulerEmailTargetTableName = 'scheduler_email_target';
export const SchedulerMsTeamsTargetTableName = 'scheduler_msteams_target';
export const SchedulerGoogleChatTargetTableName =
    'scheduler_google_chat_target';

export const SchedulerLogTableName = 'scheduler_log';

export type SchedulerDb = {
    scheduler_uuid: string;
    name: string;
    message?: string;
    format: string;
    created_at: Date;
    updated_at: Date;
    created_by: string;
    cron: string;
    timezone: string | null;
    saved_chart_uuid: string | null;
    dashboard_uuid: string | null;
    saved_sql_uuid: string | null;
    options: Record<string, AnyType>;
    filters: string | null;
    parameters: string | null;
    custom_viewport_width: number | null;
    thresholds: string | null;
    enabled: boolean;
    notification_frequency: string | null;
    selected_tabs: string[] | null;
    include_links: boolean;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
};

export type ChartSchedulerDb = SchedulerDb & {
    saved_chart_uuid: string;
    dashboard_uuid: null;
    saved_sql_uuid: null;
};
export type DashboardSchedulerDB = SchedulerDb & {
    saved_chart_uuid: null;
    dashboard_uuid: string;
    saved_sql_uuid: null;
};
export type SqlChartSchedulerDb = SchedulerDb & {
    saved_chart_uuid: null;
    dashboard_uuid: null;
    saved_sql_uuid: string;
};

export type SchedulerSlackTargetDb = {
    scheduler_slack_target_uuid: string;
    created_at: Date;
    updated_at: Date;
    scheduler_uuid: string;
    channel: string; // slack channel id
};
export type SchedulerMsTeamsTargetDb = {
    scheduler_msteams_target_uuid: string;
    created_at: Date;
    updated_at: Date;
    scheduler_uuid: string;
    webhook: string;
};
export type SchedulerGoogleChatTargetDb = {
    scheduler_google_chat_target_uuid: string;
    created_at: Date;
    updated_at: Date;
    scheduler_uuid: string;
    webhook: string;
};

export type SchedulerEmailTargetDb = {
    scheduler_email_target_uuid: string;
    created_at: Date;
    updated_at: Date;
    scheduler_uuid: string;
    recipient: string; // email address
};

export type SchedulerTable = Knex.CompositeTableType<
    SchedulerDb,
    Omit<
        ChartSchedulerDb | DashboardSchedulerDB | SqlChartSchedulerDb,
        'scheduler_uuid' | 'created_at' | 'deleted_at' | 'deleted_by_user_uuid'
    >,
    | Pick<
          SchedulerDb,
          | 'name'
          | 'message'
          | 'updated_at'
          | 'cron'
          | 'timezone'
          | 'format'
          | 'options'
          | 'filters'
          | 'parameters'
          | 'custom_viewport_width'
          | 'thresholds'
          | 'notification_frequency'
          | 'selected_tabs'
          | 'include_links'
      >
    | Pick<SchedulerDb, 'updated_at' | 'enabled'>
    | Pick<SchedulerDb, 'created_by' | 'updated_at'>
    | Pick<SchedulerDb, 'cron'>
    | Pick<SchedulerDb, 'deleted_at' | 'deleted_by_user_uuid'>
>;

export type SchedulerSlackTargetTable = Knex.CompositeTableType<
    SchedulerSlackTargetDb,
    Omit<SchedulerSlackTargetDb, 'scheduler_slack_target_uuid' | 'created_at'>,
    Pick<SchedulerSlackTargetDb, 'channel' | 'updated_at'>
>;

export type SchedulerMsTeamsTargetTable = Knex.CompositeTableType<
    SchedulerMsTeamsTargetDb,
    Omit<
        SchedulerMsTeamsTargetDb,
        'scheduler_msteams_target_uuid' | 'created_at'
    >,
    Pick<SchedulerMsTeamsTargetDb, 'webhook' | 'updated_at'>
>;

export type SchedulerGoogleChatTargetTable = Knex.CompositeTableType<
    SchedulerGoogleChatTargetDb,
    Omit<
        SchedulerGoogleChatTargetDb,
        'scheduler_google_chat_target_uuid' | 'created_at'
    >,
    Pick<SchedulerGoogleChatTargetDb, 'webhook' | 'updated_at'>
>;

export type SchedulerEmailTargetTable = Knex.CompositeTableType<
    SchedulerEmailTargetDb,
    Omit<SchedulerEmailTargetDb, 'scheduler_email_target_uuid' | 'created_at'>,
    Pick<SchedulerEmailTargetDb, 'recipient' | 'updated_at'>
>;

export type SchedulerLogDb = {
    scheduler_log_uuid: string;
    task: string;
    scheduler_uuid?: string;
    job_id: string;
    created_at: Date;
    scheduled_time: Date;
    job_group?: string;
    status: string;
    target: string | null;
    target_type: string | null;
    details: Record<string, AnyType> | null;
};

export type SchedulerLogTable = Knex.CompositeTableType<
    SchedulerLogDb,
    Omit<SchedulerLogDb, 'created_at' | 'scheduler_log_uuid'>
>;

export const getSchedulerTargetType = (
    target:
        | SchedulerSlackTarget
        | SchedulerEmailTarget
        | SchedulerMsTeamsTarget
        | SchedulerGoogleChatTarget,
): {
    schedulerTargetId: string;
    type: 'slack' | 'email' | 'msteams' | 'googlechat';
} => {
    if (isSlackTarget(target)) {
        return {
            schedulerTargetId: target.schedulerSlackTargetUuid,
            type: 'slack',
        };
    }
    if (isGoogleChatTarget(target)) {
        return {
            schedulerTargetId: target.schedulerGoogleChatTargetUuid,
            type: 'googlechat',
        };
    }
    if (isMsTeamsTarget(target)) {
        return {
            schedulerTargetId: target.schedulerMsTeamsTargetUuid,
            type: 'msteams',
        };
    }
    if (isEmailTarget(target)) {
        return {
            schedulerTargetId: target.schedulerEmailTargetUuid,
            type: 'email',
        };
    }
    return assertUnreachable(target, 'Uknown target type');
};
