import database from '../../database/database';

export const createInstallation = async (installation: any) => {
    console.debug('slack createInstallation', installation);
    const organizationId = 1;
    await database('slack_auth_tokens')
        .insert({
            organization_id: organizationId,
            installation,
        })
        .onConflict('organization_id')
        .merge();
};
export const getInstallation = async (installQuery: any) => {
    console.debug('slack getInstallation', installQuery);

    const organizationId = 1;
    const [row] = await database('slack_auth_tokens')
        .select('*')
        .where('organization_id', organizationId);
    if (row === undefined) {
        throw new Error(
            `Could not find an installation for team id ${organizationId}`,
        );
    }
    return row.installation;
};

export const deleteInstallation = async (installQuery: any) => {
    console.debug('slack deleteInstallation', installQuery);

    const organizationId = 1;

    await database('slack_auth_tokens')
        .delete()
        .where('organization_id', organizationId);
};
