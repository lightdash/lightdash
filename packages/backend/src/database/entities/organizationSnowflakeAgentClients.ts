import { type Knex } from 'knex';

export const OrganizationSnowflakeAgentClientsTableName =
    'organization_snowflake_agent_clients';

export type DbOrganizationSnowflakeAgentClient = {
    organization_snowflake_agent_client_uuid: string;
    organization_uuid: string;
    account_url: string;
    account_identifier: string;
    client_id: string;
    encrypted_client_secret: Buffer;
    client_version: string;
    created_at: Date;
    updated_at: Date;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
};

type Insert = Pick<
    DbOrganizationSnowflakeAgentClient,
    | 'organization_uuid'
    | 'account_url'
    | 'account_identifier'
    | 'client_id'
    | 'encrypted_client_secret'
> &
    Partial<DbOrganizationSnowflakeAgentClient>;

export type OrganizationSnowflakeAgentClientsTable = Knex.CompositeTableType<
    DbOrganizationSnowflakeAgentClient,
    Insert,
    Partial<Insert>
>;
