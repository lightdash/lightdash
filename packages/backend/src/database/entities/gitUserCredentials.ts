import { Knex } from 'knex';

export type DbGitUserCredential = {
    git_user_credential_uuid: string;
    user_uuid: string;
    organization_uuid: string;
    provider: string;
    provider_login: string;
    provider_user_id: string;
    encrypted_auth_token: Buffer;
    encrypted_refresh_token: Buffer;
    created_at: Date;
    updated_at: Date;
};

type DbGitUserCredentialIn = Pick<
    DbGitUserCredential,
    | 'user_uuid'
    | 'organization_uuid'
    | 'provider'
    | 'provider_login'
    | 'provider_user_id'
    | 'encrypted_auth_token'
    | 'encrypted_refresh_token'
>;

type DbGitUserCredentialUpdate = Partial<
    Pick<
        DbGitUserCredential,
        | 'provider_login'
        | 'provider_user_id'
        | 'encrypted_auth_token'
        | 'encrypted_refresh_token'
        | 'updated_at'
    >
>;

export type GitUserCredentialsTable = Knex.CompositeTableType<
    DbGitUserCredential,
    DbGitUserCredentialIn,
    DbGitUserCredentialUpdate
>;

export const GitUserCredentialsTableName = 'git_user_credentials';
