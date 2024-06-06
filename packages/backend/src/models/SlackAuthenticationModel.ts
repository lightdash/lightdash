import {
    NotFoundError,
    SlackAppCustomSettings,
    SlackSettings,
} from '@lightdash/common';
import { Installation, InstallationQuery } from '@slack/bolt';
import { Knex } from 'knex';
import { DbOrganization } from '../database/entities/organizations';
import {
    DbSlackAuthTokens,
    SlackAuthTokensTableName,
} from '../database/entities/slackAuthentication';
import { DbUser } from '../database/entities/users';

type SlackAuthenticationModelArguments = {
    database: Knex;
};

const getTeamId = (payload: Installation) => {
    if (payload.isEnterpriseInstall && payload.enterprise !== undefined) {
        return payload.enterprise.id;
    }
    if (payload.team !== undefined) {
        return payload.team.id;
    }
    throw new Error('Could not find a valid team id in the payload request');
};
export class SlackAuthenticationModel {
    private database: Knex;

    constructor(args: SlackAuthenticationModelArguments) {
        this.database = args.database;
    }

    async getOrganizationId(organizationUuid: string | undefined) {
        if (organizationUuid === undefined)
            throw new Error(
                `Could not find organization with uuid ${organizationUuid}`,
            );
        const [row] = await this.database('organizations')
            .select<DbSlackAuthTokens[]>('organization_id')
            .where('organization_uuid', organizationUuid);
        if (row === undefined) {
            throw new Error(
                `Could not find organization with uuid ${organizationUuid}`,
            );
        }
        return row.organization_id;
    }

    async createInstallation(installation: Installation) {
        const metadata = JSON.parse(installation.metadata || '{}');

        const organizationId = await this.getOrganizationId(
            metadata.organizationUuid,
        );

        const teamId = getTeamId(installation);
        await this.database(SlackAuthTokensTableName)
            .insert({
                organization_id: organizationId,
                created_by_user_id: metadata.userId,
                slack_team_id: teamId,
                installation,
            })
            .onConflict('organization_id')
            .merge();
    }

    async getInstallation(installQuery: InstallationQuery<boolean>) {
        const { teamId } = installQuery;
        const [row] = await this.database(SlackAuthTokensTableName)
            .select<DbSlackAuthTokens[]>('*')
            .where('slack_team_id', teamId);
        if (row === undefined) {
            throw new NotFoundError(
                `Could not find an installation for team id ${teamId}`,
            );
        }
        return row.installation;
    }

    async getSlackUserId(installQuery: InstallationQuery<boolean>) {
        const { teamId } = installQuery;
        const [row] = await this.database(SlackAuthTokensTableName)
            .select<DbSlackAuthTokens[]>('*')
            .where('slack_team_id', teamId);
        if (row === undefined) {
            throw new Error(`Could not find slack user id ${teamId}`);
        }
        return row.installation.user.id;
    }

    async getUserUuid(teamId: string) {
        const [row] = await this.database(SlackAuthTokensTableName)
            .leftJoin(
                'users',
                'slack_auth_tokens.created_by_user_id',
                'users.user_id',
            )
            .select<(DbSlackAuthTokens & DbUser)[]>('*')
            .where('slack_team_id', teamId);
        if (row === undefined) {
            throw new Error(`Could not find user uuid id ${teamId}`);
        }
        return row.user_uuid;
    }

    async getInstallationFromOrganizationUuid(
        organizationUuid: string,
    ): Promise<SlackSettings | undefined> {
        const [row] = await this.database(SlackAuthTokensTableName)
            .leftJoin(
                'organizations',
                'slack_auth_tokens.organization_id',
                'organizations.organization_id',
            )
            .select<(DbSlackAuthTokens & DbOrganization)[]>('*')
            .where('organization_uuid', organizationUuid);
        if (row === undefined) {
            throw new Error(`Could not find slack installation`);
        }
        return {
            createdAt: row.created_at,
            slackTeamName: row.installation?.team?.name || 'Slack',
            organizationUuid: row.organization_uuid,
            token: row.installation?.bot?.token,
            scopes: row.installation?.bot?.scopes || [],
            notificationChannel: row.notification_channel ?? undefined,
            appName: row.app_name ?? undefined,
        };
    }

    async deleteInstallation(installQuery: any) {
        const teamId = getTeamId(installQuery);

        await this.database(SlackAuthTokensTableName)
            .delete()
            .where('slack_team_id', teamId);
    }

    async deleteInstallationFromOrganizationUuid(organizationUuid: string) {
        const organizationId = await this.getOrganizationId(organizationUuid);

        await this.database(SlackAuthTokensTableName)
            .delete()
            .where('organization_id', organizationId);
    }

    async updateAppCustomSettings(
        organizationUuid: string,
        { notificationChannel, appName }: SlackAppCustomSettings,
    ) {
        const organizationId = await this.getOrganizationId(organizationUuid);

        await this.database(SlackAuthTokensTableName)
            .update({
                notification_channel: notificationChannel,
                app_name: appName,
            })
            .where('organization_id', organizationId);
    }
}
