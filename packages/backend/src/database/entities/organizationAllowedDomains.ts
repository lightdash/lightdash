import { Knex } from 'knex';

export const OrganizationAllowedDomainsTableName =
    'organization_allowed_domains';

export type DbOrganizationAllowedDomain = {
    organization_allowed_domain_uuid: string;
    organization_id: number;
    domain: string;
    type: 'sdk' | 'embed';
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type CreateDbOrganizationAllowedDomain = Pick<
    DbOrganizationAllowedDomain,
    'organization_id' | 'domain' | 'type' | 'created_by_user_uuid'
>;

export type OrganizationAllowedDomainsTable = Knex.CompositeTableType<
    DbOrganizationAllowedDomain,
    CreateDbOrganizationAllowedDomain
>;
