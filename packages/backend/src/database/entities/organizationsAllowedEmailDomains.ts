import { type OrganizationMemberRole, type ProjectMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';

export const OrganizationAllowedEmailDomainsTableName =
    'organization_allowed_email_domains';

export type DbOrganizationAllowedEmailDomains = {
    allowed_email_domains_uuid: string;
    organization_uuid: string;
    email_domains: string[];
    role: OrganizationMemberRole;
};

export type OrganizationAllowedEmailDomainsTable = Knex.CompositeTableType<
    DbOrganizationAllowedEmailDomains,
    Omit<DbOrganizationAllowedEmailDomains, 'allowed_email_domains_uuid'>,
    Omit<
        DbOrganizationAllowedEmailDomains,
        'allowed_email_domains_uuid' | 'organization_uuid'
    >
>;

export const OrganizationAllowedEmailDomainProjectsTableName =
    'organization_allowed_email_domain_projects';

export type DbOrganizationAllowedEmailDomainProjects = {
    allowed_email_domains_uuid: string;
    project_uuid: string;
    role: ProjectMemberRole;
};

export type OrganizationAllowedEmailDomainProjectsTable =
    Knex.CompositeTableType<DbOrganizationAllowedEmailDomainProjects>;
