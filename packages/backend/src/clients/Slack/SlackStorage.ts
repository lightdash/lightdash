export const createInstallation = async (installation: any) => {
    console.debug('createInstallation ', installation);
    /* const teamId = getTeamId(installation);
    const authorizatedTeamIds = (process.env.SLACK_AUTHORIZED_TEAMS || '').split(',');
    if (!authorizatedTeamIds.includes(teamId)) {
        throw new Error('Not authorized to install Cloudy in this workspace')
    }
    await knex('slack_auth_tokens')
        .insert({
           slack_team_id: teamId,
           installation,
        })
        .onConflict('slack_team_id')
        .ignore(); */
};
export const getInstallation = async (installQuery: any) => {
    console.debug('getInstallation ', installQuery);

    return {};

    /* let teamId;
    if (installQuery.isEnterpriseInstall && installQuery.enterpriseId !== undefined) {
        teamId = installQuery.enterpriseId;
    }
    else if (installQuery.teamId !== undefined) {
        teamId = installQuery.teamId;
    }
    else {
        throw new Error('Could not find a valid team id in the request')
    }
    const [row] = await knex('slack_auth_tokens').select('*').where('slack_team_id', teamId);
    if (row === undefined) {
        throw new Error(`Could not find an installation for team id ${teamId}`);
    }
    return row.installation; */
};

export const deleteInstallation = async (installQuery: any) => {
    console.debug('deleteInstallation ', installQuery);

    /* let teamId;
    if (installQuery.isEnterpriseInstall && installQuery.enterpriseId !== undefined) {
        teamId = installQuery.enterpriseId;
    }
    else if (installQuery.teamId !== undefined) {
        teamId = installQuery.teamId;
    }
    else {
        throw new Error('Could not find a valid team id in the request')
    }
    await knex('slack_auth_tokens').delete().where('slack_team_id', teamId); */
};
