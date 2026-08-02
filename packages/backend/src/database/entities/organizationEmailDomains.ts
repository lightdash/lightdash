import { Knex } from 'knex';

export const OrganizationEmailDomainsTableName = 'organization_email_domains';

export type DbOrganizationEmailDomain = {
    organization_email_domain_uuid: string;
    organization_uuid: string;
    domain: string;
    from_email: string;
    from_name: string | null;
    postmark_domain_id: number | null;
    dkim_host: string | null;
    dkim_value: string | null;
    dkim_verified: boolean;
    return_path_host: string | null;
    return_path_value: string | null;
    return_path_verified: boolean;
    is_enabled: boolean;
    verification_started_at: Date | null;
    last_checked_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type DbOrganizationEmailDomainIn = Pick<
    DbOrganizationEmailDomain,
    'organization_uuid' | 'domain' | 'from_email'
> &
    Partial<
        Pick<
            DbOrganizationEmailDomain,
            | 'from_name'
            | 'postmark_domain_id'
            | 'dkim_host'
            | 'dkim_value'
            | 'dkim_verified'
            | 'return_path_host'
            | 'return_path_value'
            | 'return_path_verified'
            | 'is_enabled'
            | 'verification_started_at'
            | 'last_checked_at'
        >
    >;

export type DbOrganizationEmailDomainUpdate = Partial<
    Pick<
        DbOrganizationEmailDomain,
        | 'domain'
        | 'from_email'
        | 'from_name'
        | 'postmark_domain_id'
        | 'dkim_host'
        | 'dkim_value'
        | 'dkim_verified'
        | 'return_path_host'
        | 'return_path_value'
        | 'return_path_verified'
        | 'is_enabled'
        | 'verification_started_at'
        | 'last_checked_at'
        | 'updated_at'
    >
>;

export type OrganizationEmailDomainsTable = Knex.CompositeTableType<
    DbOrganizationEmailDomain,
    DbOrganizationEmailDomainIn,
    DbOrganizationEmailDomainUpdate
>;
