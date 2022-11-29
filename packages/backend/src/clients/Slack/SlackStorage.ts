import database from '../../database/database';

const getTeamId = (payload: any) => {
    if (payload.isEnterpriseInstall && payload.enterprise !== undefined) {
        return payload.enterprise.id;
    }
    if (payload.team !== undefined) {
        return payload.team.id;
    }
    if (payload.teamId !== undefined) {
        return payload.teamId;
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
export const createInstallation = async (installation: any) => {
    const organizationId = await getOrganizationId(
        installation.metadata?.organizationUuid,
    );
    const teamId = getTeamId(installation);
    await database('slack_auth_tokens')
        .insert({
            organization_id: organizationId,
            slack_team_id: teamId,
            installation,
        })
        .onConflict('organization_id')
        .merge();
};
export const getInstallation = async (installQuery: any) => {
    const teamId = getTeamId(installQuery);
    const [row] = await database('slack_auth_tokens')
        .select('*')
        .where('slack_team_id', teamId);
    if (row === undefined) {
        throw new Error(`Could not find an installation for team id ${teamId}`);
    }
    return row.installation;
};

export const deleteInstallation = async (installQuery: any) => {
    const teamId = getTeamId(installQuery);

    await database('slack_auth_tokens').delete().where('slack_team_id', teamId);
};
