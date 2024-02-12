import { Knex } from 'knex';

export type DbGithubAppInstallation = {
    github_app_installation_uuid: string;
    organization_uuid: string;
    encrypted_installation_id: Buffer;
    auth_token: string;
    refresh_token: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    updated_at: Date;
    updated_by_user_uuid: string | null;
};

type DbGithubAppInstallationIn = Pick<
    DbGithubAppInstallation,
    | 'organization_uuid'
    | 'encrypted_installation_id'
    | 'created_by_user_uuid'
    | 'updated_by_user_uuid'
    | 'auth_token'
    | 'refresh_token'
>;

type DbGithubAppInstallationUpdate = Pick<
    DbGithubAppInstallation,
    'encrypted_installation_id' | 'updated_by_user_uuid' | 'updated_at'
>;

type DbGithubAppTokenUpdate = Pick<
    DbGithubAppInstallation,
    'auth_token' | 'refresh_token' | 'updated_at'
>;

export type GithubAppInstallationTable = Knex.CompositeTableType<
    DbGithubAppInstallation,
    DbGithubAppInstallationIn,
    DbGithubAppInstallationUpdate | DbGithubAppTokenUpdate
>;

export const GithubAppInstallationTableName = 'github_app_installations';
