import { Knex } from 'knex';

export type DbOrganization = {
    organization_id: number;
    organization_uuid: string;
    organization_name: string;
    allowed_email_domains: any; // jsonb
    created_at: Date;
    chart_colors?: string[];
};

export type DbOrganizationIn = Pick<DbOrganization, 'organization_name'>;
export type DbOrganizationUpdate = Partial<
    Pick<
        DbOrganization,
        'organization_name' | 'allowed_email_domains' | 'chart_colors'
    >
>;

export type OrganizationTable = Knex.CompositeTableType<
    DbOrganization,
    DbOrganizationIn,
    DbOrganizationUpdate
>;

export const OrganizationTableName = 'organizations';

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
