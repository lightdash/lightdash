import {
    AiSlackMappingNotFoundError,
    SlackAppCustomSettings,
} from '@lightdash/common';
import { SlackAuthTokensTableName } from '../../database/entities/slackAuthentication';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { SlackChannelProjectMappingsTableName } from '../database/entities/slackChannelProjectMappings';

export class CommercialSlackAuthenticationModel extends SlackAuthenticationModel {
    async getOrganizationUuidFromTeamId(teamId: string) {
        const row = await this.database(SlackAuthTokensTableName)
            .leftJoin(
                'organizations',
                'slack_auth_tokens.organization_id',
                'organizations.organization_id',
            )
            .select('organization_uuid')
            .where('slack_team_id', teamId)
            .first();

        if (!row) {
            throw new Error('Could not find organization');
        }

        return row.organization_uuid;
    }

    async getInstallationFromOrganizationUuid(organizationUuid: string) {
        const slackSettings = await super.getInstallationFromOrganizationUuid(
            organizationUuid,
            true,
        );

        if (slackSettings === undefined) return undefined;

        const slackChannelProjectMappingRows = await this.database(
            SlackChannelProjectMappingsTableName,
        )
            .select('project_uuid', 'slack_channel_id', 'available_tags')
            .where('organization_uuid', organizationUuid);

        const slackChannelProjectMappings = slackChannelProjectMappingRows.map(
            (row) => ({
                projectUuid: row.project_uuid,
                slackChannelId: row.slack_channel_id,
                availableTags: row.available_tags,
            }),
        );

        return {
            ...slackSettings,
            slackChannelProjectMappings,
        };
    }

    async getProjectSettingsForSlackChannelId(
        organizationUuid: string,
        slackChannelId: string,
    ): Promise<{
        projectUuid: string;
        availableTags: string[] | null;
    }> {
        const row = await this.database(SlackChannelProjectMappingsTableName)
            .select('project_uuid', 'available_tags')
            .where('organization_uuid', organizationUuid)
            .andWhere('slack_channel_id', slackChannelId)
            .first();

        if (!row) {
            throw new AiSlackMappingNotFoundError(
                'Could not find project mapping for slack channel',
            );
        }

        return {
            projectUuid: row.project_uuid,
            availableTags: row.available_tags,
        };
    }

    async updateAppCustomSettings(
        organizationUuid: string,
        {
            notificationChannel,
            appProfilePhotoUrl,
            slackChannelProjectMappings,
            aiThreadAccessConsent,
        }: SlackAppCustomSettings,
    ) {
        const organizationId = await this.getOrganizationId(organizationUuid);

        await this.database.transaction(async (trx) => {
            await trx(SlackAuthTokensTableName)
                .update({
                    notification_channel: notificationChannel,
                    app_profile_photo_url: appProfilePhotoUrl,
                    ai_thread_access_consent: aiThreadAccessConsent ?? false,
                })
                .where('organization_id', organizationId);

            const insertItems = slackChannelProjectMappings?.map((mapping) => ({
                organization_uuid: organizationUuid,
                project_uuid: mapping.projectUuid,
                slack_channel_id: mapping.slackChannelId,
                available_tags: mapping.availableTags,
            }));

            await trx(SlackChannelProjectMappingsTableName)
                .where('organization_uuid', organizationUuid)
                .del();

            if (!insertItems || insertItems.length === 0) return;

            await trx(SlackChannelProjectMappingsTableName).insert(insertItems);
        });
    }
}
