import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationSettings,
    AiReviewNotificationStatus,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AiReviewNotificationLogTableName,
    AiReviewNotificationSettingsTableName,
    type DbAiReviewNotificationSettings,
} from '../database/entities/aiReviewNotifications';

type AiAgentReviewNotificationModelArgs = {
    database: Knex;
};

type LogArgs = {
    notificationLogUuid?: string;
    organizationUuid: string;
    fingerprint: string;
    recipientUserUuid: string | null;
    channel: AiReviewNotificationChannel;
    event: AiReviewNotificationEvent;
};

export class AiAgentReviewNotificationModel {
    private readonly database: Knex;

    constructor({ database }: AiAgentReviewNotificationModelArgs) {
        this.database = database;
    }

    private static mapSettings(
        row: DbAiReviewNotificationSettings,
    ): AiReviewNotificationSettings {
        return {
            organizationUuid: row.organization_uuid,
            enabled: row.enabled,
            slackChannelId: row.slack_channel_id,
        };
    }

    async getSettings(
        organizationUuid: string,
    ): Promise<AiReviewNotificationSettings> {
        const row = await this.database(AiReviewNotificationSettingsTableName)
            .where({ organization_uuid: organizationUuid })
            .first();

        if (!row) {
            return {
                organizationUuid,
                enabled: false,
                slackChannelId: null,
            };
        }

        return AiAgentReviewNotificationModel.mapSettings(row);
    }

    async upsertSettings(
        settings: AiReviewNotificationSettings,
    ): Promise<AiReviewNotificationSettings> {
        const [row] = await this.database(AiReviewNotificationSettingsTableName)
            .insert({
                organization_uuid: settings.organizationUuid,
                enabled: settings.enabled,
                slack_channel_id: settings.slackChannelId,
                updated_at: new Date(),
            })
            .onConflict('organization_uuid')
            .merge({
                enabled: settings.enabled,
                slack_channel_id: settings.slackChannelId,
                updated_at: new Date(),
            })
            .returning('*');

        return AiAgentReviewNotificationModel.mapSettings(row);
    }

    async recordSent(args: LogArgs): Promise<string> {
        const [row] = await this.database(AiReviewNotificationLogTableName)
            .insert({
                ...(args.notificationLogUuid && {
                    notification_log_uuid: args.notificationLogUuid,
                }),
                organization_uuid: args.organizationUuid,
                fingerprint: args.fingerprint,
                recipient_user_uuid: args.recipientUserUuid,
                channel: args.channel,
                event: args.event,
                status: AiReviewNotificationStatus.Sent,
                error: null,
                sent_at: new Date(),
                clicked_at: null,
                dismissed_at: null,
            })
            .returning('notification_log_uuid');

        return row.notification_log_uuid;
    }

    async recordError(args: LogArgs & { error: string }): Promise<void> {
        await this.database(AiReviewNotificationLogTableName).insert({
            organization_uuid: args.organizationUuid,
            fingerprint: args.fingerprint,
            recipient_user_uuid: args.recipientUserUuid,
            channel: args.channel,
            event: args.event,
            status: AiReviewNotificationStatus.Errored,
            error: args.error,
            sent_at: null,
            clicked_at: null,
            dismissed_at: null,
        });
    }

    async recordClicked(notificationLogUuid: string): Promise<void> {
        await this.database(AiReviewNotificationLogTableName)
            .where({ notification_log_uuid: notificationLogUuid })
            .update({
                status: AiReviewNotificationStatus.Clicked,
                clicked_at: new Date(),
            });
    }

    async recordDismissed(notificationLogUuid: string): Promise<void> {
        await this.database(AiReviewNotificationLogTableName)
            .where({ notification_log_uuid: notificationLogUuid })
            .update({
                status: AiReviewNotificationStatus.Dismissed,
                dismissed_at: new Date(),
            });
    }
}
