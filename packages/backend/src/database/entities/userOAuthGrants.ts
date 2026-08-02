import { OpenIdIdentityIssuerType } from '@lightdash/common';
import { Knex } from 'knex';

export type UserOAuthGrantProvider =
    | OpenIdIdentityIssuerType.GOOGLE
    | OpenIdIdentityIssuerType.SNOWFLAKE
    | OpenIdIdentityIssuerType.DATABRICKS;

export type DbUserOAuthGrant = {
    user_oauth_grant_uuid: string;
    user_uuid: string;
    provider: UserOAuthGrantProvider;
    provider_subject: string;
    provider_email: string;
    scopes: string[];
    encrypted_refresh_token: Buffer;
    created_at: Date;
    updated_at: Date;
};

type DbUserOAuthGrantIn = Pick<
    DbUserOAuthGrant,
    | 'user_uuid'
    | 'provider'
    | 'provider_subject'
    | 'provider_email'
    | 'scopes'
    | 'encrypted_refresh_token'
>;

type DbUserOAuthGrantUpdate = Partial<
    Pick<
        DbUserOAuthGrant,
        | 'provider_subject'
        | 'provider_email'
        | 'scopes'
        | 'encrypted_refresh_token'
        | 'updated_at'
    >
>;

export type UserOAuthGrantsTable = Knex.CompositeTableType<
    DbUserOAuthGrant,
    DbUserOAuthGrantIn,
    DbUserOAuthGrantUpdate
>;

export const UserOAuthGrantsTableName = 'user_oauth_grants';
