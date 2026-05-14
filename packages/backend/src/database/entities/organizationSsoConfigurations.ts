import { Knex } from 'knex';

export const OrganizationSsoConfigurationsTableName =
    'organization_sso_configurations';

export type DbOrganizationSsoConfiguration = {
    organization_sso_configuration_uuid: string;
    organization_uuid: string;
    provider: string;
    config: Buffer;
    enabled: boolean;
    override_email_domains: boolean;
    email_domains: string[];
    allow_password: boolean;
    created_at: Date;
    updated_at: Date;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
};

type DbOrganizationSsoConfigurationInsert = Omit<
    DbOrganizationSsoConfiguration,
    | 'organization_sso_configuration_uuid'
    | 'created_at'
    | 'updated_at'
    | 'enabled'
    | 'override_email_domains'
    | 'email_domains'
    | 'allow_password'
> &
    Partial<
        Pick<
            DbOrganizationSsoConfiguration,
            | 'enabled'
            | 'override_email_domains'
            | 'email_domains'
            | 'allow_password'
        >
    >;

export type OrganizationSsoConfigurationsTable = Knex.CompositeTableType<
    DbOrganizationSsoConfiguration,
    DbOrganizationSsoConfigurationInsert,
    Partial<
        Pick<
            DbOrganizationSsoConfiguration,
            | 'config'
            | 'enabled'
            | 'override_email_domains'
            | 'email_domains'
            | 'allow_password'
            | 'updated_at'
            | 'updated_by_user_uuid'
        >
    >
>;
