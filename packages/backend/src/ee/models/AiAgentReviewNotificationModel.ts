import {
    AiReviewLinearDestination,
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationSettings,
    AiReviewNotificationStatus,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AiReviewLinearDestinationTableName,
    AiReviewNotificationLogTableName,
    AiReviewNotificationSettingsTableName,
    type DbAiReviewLinearDestination,
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
            linearEnabled: row.linear_enabled,
            linearTeamId: row.linear_team_id,
            linearProjectId: row.linear_project_id,
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
                linearEnabled: false,
                linearTeamId: null,
                linearProjectId: null,
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
                linear_enabled: settings.linearEnabled,
                linear_team_id: settings.linearTeamId,
                linear_project_id: settings.linearProjectId,
                updated_at: new Date(),
            })
            .onConflict('organization_uuid')
            .merge({
                enabled: settings.enabled,
                slack_channel_id: settings.slackChannelId,
                linear_enabled: settings.linearEnabled,
                linear_team_id: settings.linearTeamId,
                linear_project_id: settings.linearProjectId,
                updated_at: new Date(),
            })
            .returning('*');

        return AiAgentReviewNotificationModel.mapSettings(row);
    }

    private static mapLinearDestination(
        row: DbAiReviewLinearDestination,
    ): AiReviewLinearDestination {
        return {
            organizationUuid: row.organization_uuid,
            projectUuid: row.project_uuid,
            enabled: row.enabled,
            linearTeamId: row.linear_team_id,
            linearProjectId: row.linear_project_id,
        };
    }

    async getLinearDestination(
        organizationUuid: string,
        projectUuid: string,
    ): Promise<AiReviewLinearDestination> {
        const row = await this.database(AiReviewLinearDestinationTableName)
            .where({
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
            })
            .first();

        if (row) {
            return AiAgentReviewNotificationModel.mapLinearDestination(row);
        }

        // Preserve routing configured before destinations became project-scoped.
        const legacy = await this.getSettings(organizationUuid);
        return {
            organizationUuid,
            projectUuid,
            enabled: legacy.linearEnabled,
            linearTeamId: legacy.linearTeamId,
            linearProjectId: legacy.linearProjectId,
        };
    }

    async upsertLinearDestination(
        destination: AiReviewLinearDestination,
    ): Promise<AiReviewLinearDestination> {
        const [row] = await this.database(AiReviewLinearDestinationTableName)
            .insert({
                organization_uuid: destination.organizationUuid,
                project_uuid: destination.projectUuid,
                enabled: destination.enabled,
                linear_team_id: destination.linearTeamId,
                linear_project_id: destination.linearProjectId,
                updated_at: new Date(),
            })
            .onConflict('project_uuid')
            .merge({
                enabled: destination.enabled,
                linear_team_id: destination.linearTeamId,
                linear_project_id: destination.linearProjectId,
                updated_at: new Date(),
            })
            .returning('*');

        return AiAgentReviewNotificationModel.mapLinearDestination(row);
    }

    async clearLinearDestinations(organizationUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(AiReviewLinearDestinationTableName)
                .where({ organization_uuid: organizationUuid })
                .delete();
            await trx(AiReviewNotificationSettingsTableName)
                .where({ organization_uuid: organizationUuid })
                .update({
                    linear_enabled: false,
                    linear_team_id: null,
                    linear_project_id: null,
                    updated_at: new Date(),
                });
        });
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
