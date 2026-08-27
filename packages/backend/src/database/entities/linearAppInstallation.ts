import { Knex } from 'knex';

export const LinearAppInstallationTableName = 'linear_app_installations';

export type DbLinearAppInstallation = {
    linear_app_installation_uuid: string;
    organization_uuid: string;
    encrypted_installation_id: Buffer;
    encrypted_access_token: Buffer;
    encrypted_refresh_token: Buffer | null;
    oauth_client_id: string | null;
    linear_organization_name: string;
    linear_organization_url_key: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    updated_at: Date;
    updated_by_user_uuid: string | null;
};

type DbLinearAppInstallationIn = Pick<
    DbLinearAppInstallation,
    | 'organization_uuid'
    | 'encrypted_installation_id'
    | 'encrypted_access_token'
    | 'encrypted_refresh_token'
    | 'oauth_client_id'
    | 'linear_organization_name'
    | 'linear_organization_url_key'
    | 'created_by_user_uuid'
    | 'updated_by_user_uuid'
>;

type DbLinearAppInstallationUpdate = Partial<
    Pick<
        DbLinearAppInstallation,
        | 'encrypted_installation_id'
        | 'encrypted_access_token'
        | 'encrypted_refresh_token'
        | 'oauth_client_id'
        | 'linear_organization_name'
        | 'linear_organization_url_key'
        | 'updated_by_user_uuid'
        | 'updated_at'
    >
>;

export type LinearAppInstallationTable = Knex.CompositeTableType<
    DbLinearAppInstallation,
    DbLinearAppInstallationIn,
    DbLinearAppInstallationUpdate
>;
