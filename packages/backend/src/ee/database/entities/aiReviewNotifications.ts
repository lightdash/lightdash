import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationStatus,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AiReviewNotificationLogTableName = 'ai_agent_review_notification';
export const AiReviewNotificationSettingsTableName =
    'ai_agent_review_notification_settings';

export type DbAiReviewNotificationSettings = {
    organization_uuid: string;
    enabled: boolean;
    slack_channel_id: string | null;
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

export type AiReviewNotificationSettingsTable = Knex.CompositeTableType<
    DbAiReviewNotificationSettings,
    Pick<
        DbAiReviewNotificationSettings,
        'organization_uuid' | 'enabled' | 'slack_channel_id'
    > &
        Partial<
            Pick<DbAiReviewNotificationSettings, 'created_at' | 'updated_at'>
        >,
    Partial<
        Pick<
            DbAiReviewNotificationSettings,
            'enabled' | 'slack_channel_id' | 'updated_at'
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
