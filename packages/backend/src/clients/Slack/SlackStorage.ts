import database from '../../database/database';

export const getTeamId = (payload: any) => {
    if (payload.isEnterpriseInstall && payload.enterprise !== undefined) {
        return payload.enterprise.id;
    }
    if (payload.team !== undefined) {
        return payload.team.id;
    }

    throw new Error('Could not find a valid team id in the payload request');
};

export const createInstallation = async (installation: any) => {
    console.debug('slack createInstallation', installation);
    const teamId = getTeamId(installation);
    const authorizatedTeamIds = (
        process.env.SLACK_AUTHORIZED_TEAMS || ''
    ).split(',');
    if (!authorizatedTeamIds.includes(teamId)) {
        throw new Error('Not authorized to install Cloudy in this workspace');
    }
    await database('slack_auth_tokens')
        .insert({
            slack_team_id: teamId,
            installation,
        })
        .onConflict('slack_team_id')
        .ignore();
};
export const getInstallation = async (installQuery: any) => {
    console.debug('slack getInstallation', installQuery);

    let teamId;
    if (
        installQuery.isEnterpriseInstall &&
        installQuery.enterpriseId !== undefined
    ) {
        teamId = installQuery.enterpriseId;
    } else if (installQuery.teamId !== undefined) {
        teamId = installQuery.teamId;
    } else {
        throw new Error('Could not find a valid team id in the request');
    }
    const [row] = await database('slack_auth_tokens')
        .select('*')
        .where('slack_team_id', teamId);
    if (row === undefined) {
        throw new Error(`Could not find an installation for team id ${teamId}`);
    }
    return row.installation;
};

export const deleteInstallation = async (installQuery: any) => {
    console.debug('slack deleteInstallation', installQuery);

    let teamId;
    if (
        installQuery.isEnterpriseInstall &&
        installQuery.enterpriseId !== undefined
    ) {
        teamId = installQuery.enterpriseId;
    } else if (installQuery.teamId !== undefined) {
        teamId = installQuery.teamId;
    } else {
        throw new Error('Could not find a valid team id in the request');
    }
    await database('slack_auth_tokens').delete().where('slack_team_id', teamId);
};
