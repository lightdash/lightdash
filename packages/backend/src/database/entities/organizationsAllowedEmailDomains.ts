import { OrganizationMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

export const OrganizationAllowedEmailDomainsTableName =
    'organization_allowed_email_domains';

export type DbOrganizationAllowedEmailDomains = {
    allowed_email_domains_uuid: string;
    organization_uuid: string;
    email_domains: string[];
    role: OrganizationMemberRole;
    project_uuids: string[];
};

export type OrganizationAllowedEmailDomainsTable = Knex.CompositeTableType<
    DbOrganizationAllowedEmailDomains,
    Omit<DbOrganizationAllowedEmailDomains, 'allowed_email_domains_uuid'>,
    Omit<
        DbOrganizationAllowedEmailDomains,
        'allowed_email_domains_uuid' | 'organization_uuid'
    >
>;
