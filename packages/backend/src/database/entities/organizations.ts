import { Knex } from 'knex';

export type DbOrganization = {
    organization_id: number;
    organization_uuid: string;
    organization_name: string;
    created_at: Date;
};

export type DbOrganizationIn = {
    organization_name: string;
};

// DB Errors: Unexpected response (no rows returned)
export const createOrganization = async (
    db: Knex,
    organizationIn: DbOrganizationIn,
): Promise<DbOrganization> => {
    const org = await db<DbOrganization>('organizations')
        .insert<DbOrganizationIn>(organizationIn)
        .returning('*');
    return org[0];
};
