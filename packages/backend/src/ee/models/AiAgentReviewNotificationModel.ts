import {
    AiReviewJiraDestination,
    AiReviewJiraRouting,
    AiReviewLinearDestination,
    AiReviewLinearRouting,
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    AiReviewNotificationSettings,
    AiReviewNotificationStatus,
    resolveAiReviewJiraDestination,
    resolveAiReviewLinearDestination,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AiReviewJiraDestinationTableName,
    AiReviewLinearDestinationTableName,
    AiReviewNotificationLogTableName,
    AiReviewNotificationSettingsTableName,
    type DbAiReviewJiraDestination,
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
            jiraEnabled: row.jira_enabled ?? false,
            jiraProjectId: row.jira_project_id ?? null,
            jiraIssueTypeId: row.jira_issue_type_id ?? null,
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
                jiraEnabled: false,
                jiraProjectId: null,
                jiraIssueTypeId: null,
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
                jira_enabled: settings.jiraEnabled,
                jira_project_id: settings.jiraProjectId,
                jira_issue_type_id: settings.jiraIssueTypeId,
                updated_at: new Date(),
            })
            .onConflict('organization_uuid')
            .merge({
                enabled: settings.enabled,
                slack_channel_id: settings.slackChannelId,
                linear_enabled: settings.linearEnabled,
                linear_team_id: settings.linearTeamId,
                linear_project_id: settings.linearProjectId,
                jira_enabled: settings.jiraEnabled,
                jira_project_id: settings.jiraProjectId,
                jira_issue_type_id: settings.jiraIssueTypeId,
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

    async listLinearDestinations(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<AiReviewLinearDestination[]> {
        const rows = await database(AiReviewLinearDestinationTableName).where({
            organization_uuid: organizationUuid,
        });

        return rows.map(AiAgentReviewNotificationModel.mapLinearDestination);
    }

    private async getSettingsRow(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<DbAiReviewNotificationSettings | undefined> {
        return database(AiReviewNotificationSettingsTableName)
            .where({ organization_uuid: organizationUuid })
            .first();
    }

    async getLinearDestination(
        organizationUuid: string,
        projectUuid: string,
    ): Promise<AiReviewLinearDestination> {
        const settingsRow = await this.getSettingsRow(organizationUuid);
        const settings = settingsRow
            ? AiAgentReviewNotificationModel.mapSettings(settingsRow)
            : await this.getSettings(organizationUuid);
        const destinationRow = await this.database(
            AiReviewLinearDestinationTableName,
        )
            .where({
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
            })
            .first();

        let hasProjectDestinations = !!destinationRow;
        if (
            !(settingsRow?.linear_apply_to_all_projects ?? false) &&
            !destinationRow
        ) {
            const anyDestination = await this.database(
                AiReviewLinearDestinationTableName,
            )
                .where({ organization_uuid: organizationUuid })
                .first();
            hasProjectDestinations = !!anyDestination;
        }

        return resolveAiReviewLinearDestination({
            organizationUuid,
            projectUuid,
            applyToAllProjects:
                settingsRow?.linear_apply_to_all_projects ?? false,
            settings,
            destination: destinationRow
                ? AiAgentReviewNotificationModel.mapLinearDestination(
                      destinationRow,
                  )
                : null,
            hasProjectDestinations,
        });
    }

    async getLinearRouting(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<AiReviewLinearRouting> {
        const settingsRow = await this.getSettingsRow(
            organizationUuid,
            database,
        );
        const settings = settingsRow
            ? AiAgentReviewNotificationModel.mapSettings(settingsRow)
            : {
                  organizationUuid,
                  enabled: false,
                  slackChannelId: null,
                  linearEnabled: false,
                  linearTeamId: null,
                  linearProjectId: null,
                  jiraEnabled: false,
                  jiraProjectId: null,
                  jiraIssueTypeId: null,
              };
        const destinations = await this.listLinearDestinations(
            organizationUuid,
            database,
        );
        const applyToAllProjects =
            settingsRow?.linear_apply_to_all_projects ?? false;

        if (applyToAllProjects) {
            return {
                organizationUuid,
                applyToAllProjects: true,
                projectUuids: [],
                enabled: settings.linearEnabled,
                linearTeamId: settings.linearTeamId,
                linearProjectId: settings.linearProjectId,
            };
        }

        if (destinations.length > 0) {
            const enabledDestinations = destinations.filter(
                (destination) => destination.enabled,
            );
            const first = enabledDestinations[0] ?? destinations[0];
            return {
                organizationUuid,
                applyToAllProjects: false,
                projectUuids: (enabledDestinations.length > 0
                    ? enabledDestinations
                    : destinations
                ).map((destination) => destination.projectUuid),
                enabled: enabledDestinations.length > 0,
                linearTeamId: first.linearTeamId,
                linearProjectId: first.linearProjectId,
            };
        }

        if (settings.linearTeamId) {
            return {
                organizationUuid,
                applyToAllProjects: true,
                projectUuids: [],
                enabled: settings.linearEnabled,
                linearTeamId: settings.linearTeamId,
                linearProjectId: settings.linearProjectId,
            };
        }

        return {
            organizationUuid,
            applyToAllProjects: true,
            projectUuids: [],
            enabled: false,
            linearTeamId: null,
            linearProjectId: null,
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

        await this.database(AiReviewNotificationSettingsTableName)
            .where({ organization_uuid: destination.organizationUuid })
            .update({
                linear_apply_to_all_projects: false,
                updated_at: new Date(),
            });

        return AiAgentReviewNotificationModel.mapLinearDestination(row);
    }

    async upsertLinearRouting(
        routing: AiReviewLinearRouting,
    ): Promise<AiReviewLinearRouting> {
        return this.database.transaction(async (trx) => {
            const currentSettings = await this.getSettingsRow(
                routing.organizationUuid,
                trx,
            );
            await trx(AiReviewNotificationSettingsTableName)
                .insert({
                    organization_uuid: routing.organizationUuid,
                    enabled: currentSettings?.enabled ?? false,
                    slack_channel_id: currentSettings?.slack_channel_id ?? null,
                    linear_enabled: routing.enabled,
                    linear_team_id: routing.linearTeamId,
                    linear_project_id: routing.linearProjectId,
                    linear_apply_to_all_projects: routing.applyToAllProjects,
                    updated_at: new Date(),
                })
                .onConflict('organization_uuid')
                .merge({
                    linear_enabled: routing.enabled,
                    linear_team_id: routing.linearTeamId,
                    linear_project_id: routing.linearProjectId,
                    linear_apply_to_all_projects: routing.applyToAllProjects,
                    updated_at: new Date(),
                });

            if (
                routing.applyToAllProjects ||
                routing.projectUuids.length === 0
            ) {
                await trx(AiReviewLinearDestinationTableName)
                    .where({ organization_uuid: routing.organizationUuid })
                    .delete();
            } else {
                await trx(AiReviewLinearDestinationTableName)
                    .where({ organization_uuid: routing.organizationUuid })
                    .whereNotIn('project_uuid', routing.projectUuids)
                    .delete();

                const now = new Date();
                await trx(AiReviewLinearDestinationTableName)
                    .insert(
                        routing.projectUuids.map((projectUuid) => ({
                            organization_uuid: routing.organizationUuid,
                            project_uuid: projectUuid,
                            enabled: routing.enabled,
                            linear_team_id: routing.linearTeamId,
                            linear_project_id: routing.linearProjectId,
                            updated_at: now,
                        })),
                    )
                    .onConflict('project_uuid')
                    .merge({
                        enabled: routing.enabled,
                        linear_team_id: routing.linearTeamId,
                        linear_project_id: routing.linearProjectId,
                        updated_at: now,
                    });
            }

            return this.getLinearRouting(routing.organizationUuid, trx);
        });
    }

    async clearLinearDestinations(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<void> {
        await database(AiReviewLinearDestinationTableName)
            .where({ organization_uuid: organizationUuid })
            .delete();
        await database(AiReviewNotificationSettingsTableName)
            .where({ organization_uuid: organizationUuid })
            .update({
                linear_enabled: false,
                linear_team_id: null,
                linear_project_id: null,
                linear_apply_to_all_projects: false,
                updated_at: new Date(),
            });
    }

    private static mapJiraDestination(
        row: DbAiReviewJiraDestination,
    ): AiReviewJiraDestination {
        return {
            organizationUuid: row.organization_uuid,
            projectUuid: row.project_uuid,
            enabled: row.enabled,
            jiraProjectId: row.jira_project_id,
            jiraIssueTypeId: row.jira_issue_type_id,
        };
    }

    async listJiraDestinations(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<AiReviewJiraDestination[]> {
        const rows = await database(AiReviewJiraDestinationTableName).where({
            organization_uuid: organizationUuid,
        });
        return rows.map(AiAgentReviewNotificationModel.mapJiraDestination);
    }

    async getJiraDestination(
        organizationUuid: string,
        projectUuid: string,
    ): Promise<AiReviewJiraDestination> {
        const settingsRow = await this.getSettingsRow(organizationUuid);
        const settings = settingsRow
            ? AiAgentReviewNotificationModel.mapSettings(settingsRow)
            : await this.getSettings(organizationUuid);
        const destinationRow = await this.database(
            AiReviewJiraDestinationTableName,
        )
            .where({
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
            })
            .first();
        let hasProjectDestinations = !!destinationRow;
        if (
            !(settingsRow?.jira_apply_to_all_projects ?? false) &&
            !destinationRow
        ) {
            hasProjectDestinations = !!(await this.database(
                AiReviewJiraDestinationTableName,
            )
                .where({ organization_uuid: organizationUuid })
                .first());
        }
        return resolveAiReviewJiraDestination({
            organizationUuid,
            projectUuid,
            applyToAllProjects:
                settingsRow?.jira_apply_to_all_projects ?? false,
            settings,
            destination: destinationRow
                ? AiAgentReviewNotificationModel.mapJiraDestination(
                      destinationRow,
                  )
                : null,
            hasProjectDestinations,
        });
    }

    async getJiraRouting(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<AiReviewJiraRouting> {
        const settingsRow = await this.getSettingsRow(
            organizationUuid,
            database,
        );
        const settings = settingsRow
            ? AiAgentReviewNotificationModel.mapSettings(settingsRow)
            : await this.getSettings(organizationUuid);
        const destinations = await this.listJiraDestinations(
            organizationUuid,
            database,
        );
        const applyToAllProjects =
            settingsRow?.jira_apply_to_all_projects ?? false;

        if (applyToAllProjects) {
            return {
                organizationUuid,
                applyToAllProjects: true,
                projectUuids: [],
                enabled: settings.jiraEnabled,
                jiraProjectId: settings.jiraProjectId,
                jiraIssueTypeId: settings.jiraIssueTypeId,
            };
        }
        if (destinations.length > 0) {
            const enabled = destinations.filter(
                (destination) => destination.enabled,
            );
            const first = enabled[0] ?? destinations[0];
            return {
                organizationUuid,
                applyToAllProjects: false,
                projectUuids: (enabled.length > 0 ? enabled : destinations).map(
                    (destination) => destination.projectUuid,
                ),
                enabled: enabled.length > 0,
                jiraProjectId: first.jiraProjectId,
                jiraIssueTypeId: first.jiraIssueTypeId,
            };
        }
        if (settings.jiraProjectId) {
            return {
                organizationUuid,
                applyToAllProjects: true,
                projectUuids: [],
                enabled: settings.jiraEnabled,
                jiraProjectId: settings.jiraProjectId,
                jiraIssueTypeId: settings.jiraIssueTypeId,
            };
        }
        return {
            organizationUuid,
            applyToAllProjects: true,
            projectUuids: [],
            enabled: false,
            jiraProjectId: null,
            jiraIssueTypeId: null,
        };
    }

    async upsertJiraDestination(
        destination: AiReviewJiraDestination,
    ): Promise<AiReviewJiraDestination> {
        const [row] = await this.database(AiReviewJiraDestinationTableName)
            .insert({
                organization_uuid: destination.organizationUuid,
                project_uuid: destination.projectUuid,
                enabled: destination.enabled,
                jira_project_id: destination.jiraProjectId,
                jira_issue_type_id: destination.jiraIssueTypeId,
                updated_at: new Date(),
            })
            .onConflict('project_uuid')
            .merge({
                enabled: destination.enabled,
                jira_project_id: destination.jiraProjectId,
                jira_issue_type_id: destination.jiraIssueTypeId,
                updated_at: new Date(),
            })
            .returning('*');
        await this.database(AiReviewNotificationSettingsTableName)
            .where({ organization_uuid: destination.organizationUuid })
            .update({
                jira_apply_to_all_projects: false,
                updated_at: new Date(),
            });
        return AiAgentReviewNotificationModel.mapJiraDestination(row);
    }

    async upsertJiraRouting(
        routing: AiReviewJiraRouting,
    ): Promise<AiReviewJiraRouting> {
        return this.database.transaction(async (trx) => {
            const current = await this.getSettingsRow(
                routing.organizationUuid,
                trx,
            );
            await trx(AiReviewNotificationSettingsTableName)
                .insert({
                    organization_uuid: routing.organizationUuid,
                    enabled: current?.enabled ?? false,
                    slack_channel_id: current?.slack_channel_id ?? null,
                    linear_enabled: current?.linear_enabled ?? false,
                    linear_team_id: current?.linear_team_id ?? null,
                    linear_project_id: current?.linear_project_id ?? null,
                    linear_apply_to_all_projects:
                        current?.linear_apply_to_all_projects ?? false,
                    jira_enabled: routing.enabled,
                    jira_project_id: routing.jiraProjectId,
                    jira_issue_type_id: routing.jiraIssueTypeId,
                    jira_apply_to_all_projects: routing.applyToAllProjects,
                    updated_at: new Date(),
                })
                .onConflict('organization_uuid')
                .merge({
                    jira_enabled: routing.enabled,
                    jira_project_id: routing.jiraProjectId,
                    jira_issue_type_id: routing.jiraIssueTypeId,
                    jira_apply_to_all_projects: routing.applyToAllProjects,
                    updated_at: new Date(),
                });

            if (
                routing.applyToAllProjects ||
                routing.projectUuids.length === 0
            ) {
                await trx(AiReviewJiraDestinationTableName)
                    .where({ organization_uuid: routing.organizationUuid })
                    .delete();
            } else {
                await trx(AiReviewJiraDestinationTableName)
                    .where({ organization_uuid: routing.organizationUuid })
                    .whereNotIn('project_uuid', routing.projectUuids)
                    .delete();
                const now = new Date();
                await trx(AiReviewJiraDestinationTableName)
                    .insert(
                        routing.projectUuids.map((projectUuid) => ({
                            organization_uuid: routing.organizationUuid,
                            project_uuid: projectUuid,
                            enabled: routing.enabled,
                            jira_project_id: routing.jiraProjectId,
                            jira_issue_type_id: routing.jiraIssueTypeId,
                            updated_at: now,
                        })),
                    )
                    .onConflict('project_uuid')
                    .merge({
                        enabled: routing.enabled,
                        jira_project_id: routing.jiraProjectId,
                        jira_issue_type_id: routing.jiraIssueTypeId,
                        updated_at: now,
                    });
            }
            return this.getJiraRouting(routing.organizationUuid, trx);
        });
    }

    async clearJiraDestinations(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<void> {
        await database.transaction(async (trx) => {
            await trx(AiReviewJiraDestinationTableName)
                .where({ organization_uuid: organizationUuid })
                .delete();
            await trx(AiReviewNotificationSettingsTableName)
                .where({ organization_uuid: organizationUuid })
                .update({
                    jira_enabled: false,
                    jira_project_id: null,
                    jira_issue_type_id: null,
                    jira_apply_to_all_projects: false,
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
