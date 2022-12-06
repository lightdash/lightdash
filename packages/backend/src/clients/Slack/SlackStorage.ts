import { Installation, InstallationQuery } from '@slack/bolt';
import database from '../../database/database';

const getTeamId = (payload: Installation) => {
    if (payload.isEnterpriseInstall && payload.enterprise !== undefined) {
        return payload.enterprise.id;
    }
    if (payload.team !== undefined) {
        return payload.team.id;
    }

    throw new Error('Could not find a valid team id in the payload request');
};
export const getOrganizationId = async (
    organizationUuid: string | undefined,
) => {
    if (organizationUuid === undefined)
        throw new Error(
            `Could not find organization with uuid ${organizationUuid}`,
        );
    const [row] = await database('organizations')
        .select('organization_id')
        .where('organization_uuid', organizationUuid);
    if (row === undefined) {
        throw new Error(
            `Could not find organization with uuid ${organizationUuid}`,
        );
    }
    return row.organization_id;
};
export const createInstallation = async (installation: Installation) => {
    const metadata = JSON.parse(installation.metadata || '{}');
    const organizationId = await getOrganizationId(metadata.organizationUuid);

    const teamId = getTeamId(installation);
    await database('slack_auth_tokens')
        .insert({
            organization_id: organizationId,
            created_by_user_id: metadata.userId,
            slack_team_id: teamId,
            installation,
        })
        .onConflict('organization_id')
        .merge();
};
export const getInstallation = async (
    installQuery: InstallationQuery<boolean>,
) => {
    const { teamId } = installQuery;
    const [row] = await database('slack_auth_tokens')
        .select('*')
        .where('slack_team_id', teamId);
    if (row === undefined) {
        throw new Error(`Could not find an installation for team id ${teamId}`);
    }
    return row.installation;
};

export const getSlackUserId = async (
    installQuery: InstallationQuery<boolean>,
) => {
    const { teamId } = installQuery;
    const [row] = await database('slack_auth_tokens')
        .leftJoin(
            'users',
            'slack_auth_tokens.created_by_user_id',
            'users.user_id',
        )
        .select('*')
        .where('slack_team_id', teamId);
    if (row === undefined) {
        throw new Error(`Could not find an installation for team id ${teamId}`);
    }
    return row.installation.user.id;
};

export const getUserUuid = async (installQuery: InstallationQuery<boolean>) => {
    const { teamId } = installQuery;
    const [row] = await database('slack_auth_tokens')
        .leftJoin(
            'users',
            'slack_auth_tokens.created_by_user_id',
            'users.user_id',
        )
        .select('*')
        .where('slack_team_id', teamId);
    if (row === undefined) {
        throw new Error(`Could not find an installation for team id ${teamId}`);
    }
    return row.user_uuid;
};

export const getInstallationFromOrganizationUuid = async (
    organizationUuid: string,
) => {
    const [row] = await database('slack_auth_tokens')
        .leftJoin(
            'organizations',
            'slack_auth_tokens.organization_id',
            'organizations.organization_id',
        )
        .select('*')
        .where('organization_uuid', organizationUuid);
    if (row === undefined) {
        throw new Error(
            `Could not find an installation for organizationUuid ${organizationUuid}`,
        );
    }
    return row;
};

export const deleteInstallation = async (installQuery: any) => {
    const teamId = getTeamId(installQuery);

    await database('slack_auth_tokens').delete().where('slack_team_id', teamId);
};

export const deleteInstallationFromOrganizationUuid = async (
    organizationUuid: string,
) => {
    const organizationId = await getOrganizationId(organizationUuid);

    await database('slack_auth_tokens')
        .delete()
        .where('organization_id', organizationId);
};
