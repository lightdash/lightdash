import { Knex } from 'knex';
import database from '../database';

export type DbOrganization = {
    organization_id: number;
    organization_uuid: string;
    organization_name: string;
    created_at: Date;
};

export type DbOrganizationIn = Pick<DbOrganization, 'organization_name'>;
export type DbOrganizationUpdate = Pick<DbOrganization, 'organization_name'>;

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

export const updateOrganization = async (
    organizationUuid: string,
    organizationUpdate: DbOrganizationUpdate,
): Promise<void> => {
    await database<DbOrganization>('organizations')
        .where('organization_uuid', organizationUuid)
        .update<DbOrganizationUpdate>(organizationUpdate);
};
