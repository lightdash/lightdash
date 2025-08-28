import { Knex } from 'knex';

export type DbGitlabAppInstallation = {
    gitlab_app_installation_uuid: string;
    organization_uuid: string;
    encrypted_installation_id: Buffer;
    auth_token: string;
    refresh_token: string;
    gitlab_instance_url: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    updated_at: Date;
    updated_by_user_uuid: string | null;
};

type DbGitlabAppInstallationIn = Pick<
    DbGitlabAppInstallation,
    | 'organization_uuid'
    | 'encrypted_installation_id'
    | 'created_by_user_uuid'
    | 'updated_by_user_uuid'
    | 'auth_token'
    | 'refresh_token'
    | 'gitlab_instance_url'
>;

type DbGitlabAppInstallationUpdate = Pick<
    DbGitlabAppInstallation,
    'encrypted_installation_id' | 'updated_by_user_uuid' | 'updated_at'
>;

type DbGitlabAppTokenUpdate = Pick<
    DbGitlabAppInstallation,
    'auth_token' | 'refresh_token' | 'updated_at'
>;

export type GitlabAppInstallationTable = Knex.CompositeTableType<
    DbGitlabAppInstallation,
    DbGitlabAppInstallationIn,
    DbGitlabAppInstallationUpdate | DbGitlabAppTokenUpdate
>;

export const GitlabAppInstallationTableName = 'gitlab_app_installations';
