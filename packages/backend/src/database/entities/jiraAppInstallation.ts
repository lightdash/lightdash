import { type Knex } from 'knex';

export const JiraAppInstallationTableName = 'jira_app_installations';

export type DbJiraAppInstallation = {
    jira_app_installation_uuid: string;
    organization_uuid: string;
    oauth_client_id: string;
    encrypted_oauth_client_secret: Buffer;
    encrypted_access_token: Buffer;
    encrypted_refresh_token: Buffer | null;
    token_expires_at: Date;
    jira_site_id: string | null;
    jira_site_name: string | null;
    jira_site_url: string | null;
    created_at: Date;
    created_by_user_uuid: string | null;
    updated_at: Date;
    updated_by_user_uuid: string | null;
};

type DbJiraAppInstallationIn = Pick<
    DbJiraAppInstallation,
    | 'organization_uuid'
    | 'oauth_client_id'
    | 'encrypted_oauth_client_secret'
    | 'encrypted_access_token'
    | 'encrypted_refresh_token'
    | 'token_expires_at'
    | 'jira_site_id'
    | 'jira_site_name'
    | 'jira_site_url'
    | 'created_by_user_uuid'
    | 'updated_by_user_uuid'
>;

type DbJiraAppInstallationUpdate = Partial<
    Omit<
        DbJiraAppInstallationIn,
        'organization_uuid' | 'created_by_user_uuid'
    > & { updated_at: Date }
>;

export type JiraAppInstallationTable = Knex.CompositeTableType<
    DbJiraAppInstallation,
    DbJiraAppInstallationIn,
    DbJiraAppInstallationUpdate
>;
