import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationStatus,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AiReviewNotificationLogTableName = 'ai_agent_review_notification';
export const AiReviewNotificationSettingsTableName =
    'ai_agent_review_notification_settings';
export const AiReviewLinearDestinationTableName =
    'ai_agent_review_linear_destinations';
export const AiReviewJiraDestinationTableName =
    'ai_agent_review_jira_destinations';

export type DbAiReviewNotificationSettings = {
    organization_uuid: string;
    enabled: boolean;
    slack_channel_id: string | null;
    linear_enabled: boolean;
    linear_team_id: string | null;
    linear_project_id: string | null;
    linear_apply_to_all_projects: boolean | null;
    jira_enabled: boolean;
    jira_project_id: string | null;
    jira_issue_type_id: string | null;
    jira_apply_to_all_projects: boolean | null;
    created_at: Date;
    updated_at: Date;
};

export type DbAiReviewNotificationLog = {
    notification_log_uuid: string;
    organization_uuid: string;
    fingerprint: string;
    recipient_user_uuid: string | null;
    channel: AiReviewNotificationChannel;
    event: AiReviewNotificationEvent;
    status: AiReviewNotificationStatus;
    error: string | null;
    sent_at: Date | null;
    clicked_at: Date | null;
    dismissed_at: Date | null;
    created_at: Date;
};

export type DbAiReviewLinearDestination = {
    ai_review_linear_destination_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    enabled: boolean;
    linear_team_id: string | null;
    linear_project_id: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbAiReviewJiraDestination = {
    ai_review_jira_destination_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    enabled: boolean;
    jira_project_id: string | null;
    jira_issue_type_id: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AiReviewNotificationSettingsTable = Knex.CompositeTableType<
    DbAiReviewNotificationSettings,
    Pick<
        DbAiReviewNotificationSettings,
        | 'organization_uuid'
        | 'enabled'
        | 'slack_channel_id'
        | 'linear_enabled'
        | 'linear_team_id'
        | 'linear_project_id'
    > &
        Partial<
            Pick<
                DbAiReviewNotificationSettings,
                | 'linear_apply_to_all_projects'
                | 'jira_enabled'
                | 'jira_project_id'
                | 'jira_issue_type_id'
                | 'jira_apply_to_all_projects'
                | 'created_at'
                | 'updated_at'
            >
        >,
    Partial<
        Pick<
            DbAiReviewNotificationSettings,
            | 'enabled'
            | 'slack_channel_id'
            | 'linear_enabled'
            | 'linear_team_id'
            | 'linear_project_id'
            | 'linear_apply_to_all_projects'
            | 'jira_enabled'
            | 'jira_project_id'
            | 'jira_issue_type_id'
            | 'jira_apply_to_all_projects'
            | 'updated_at'
        >
    >
>;

export type AiReviewNotificationLogTable = Knex.CompositeTableType<
    DbAiReviewNotificationLog,
    Omit<
        Pick<
            DbAiReviewNotificationLog,
            | 'notification_log_uuid'
            | 'organization_uuid'
            | 'fingerprint'
            | 'recipient_user_uuid'
            | 'channel'
            | 'event'
            | 'status'
            | 'error'
            | 'sent_at'
            | 'clicked_at'
            | 'dismissed_at'
        >,
        'notification_log_uuid'
    > &
        Partial<Pick<DbAiReviewNotificationLog, 'notification_log_uuid'>>,
    Partial<
        Pick<
            DbAiReviewNotificationLog,
            'status' | 'error' | 'sent_at' | 'clicked_at' | 'dismissed_at'
        >
    >
>;

export type AiReviewLinearDestinationTable = Knex.CompositeTableType<
    DbAiReviewLinearDestination,
    Pick<
        DbAiReviewLinearDestination,
        | 'organization_uuid'
        | 'project_uuid'
        | 'enabled'
        | 'linear_team_id'
        | 'linear_project_id'
    > &
        Partial<
            Pick<
                DbAiReviewLinearDestination,
                | 'ai_review_linear_destination_uuid'
                | 'created_at'
                | 'updated_at'
            >
        >,
    Partial<
        Pick<
            DbAiReviewLinearDestination,
            'enabled' | 'linear_team_id' | 'linear_project_id' | 'updated_at'
        >
    >
>;

export type AiReviewJiraDestinationTable = Knex.CompositeTableType<
    DbAiReviewJiraDestination,
    Pick<
        DbAiReviewJiraDestination,
        | 'organization_uuid'
        | 'project_uuid'
        | 'enabled'
        | 'jira_project_id'
        | 'jira_issue_type_id'
    > &
        Partial<
            Pick<
                DbAiReviewJiraDestination,
                'ai_review_jira_destination_uuid' | 'created_at' | 'updated_at'
            >
        >,
    Partial<
        Pick<
            DbAiReviewJiraDestination,
            'enabled' | 'jira_project_id' | 'jira_issue_type_id' | 'updated_at'
        >
    >
>;
