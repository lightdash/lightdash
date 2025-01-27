import { Knex } from 'knex';

export type DbScimOrganizationAccessToken = {
    scim_organization_access_token_uuid: string;
    token_hash: string;
    organization_uuid: string;
    created_at: Date;
    description: string;
    expires_at: Date | null;
    created_by_user_uuid: string | null;
    rotated_at: Date | null;
    rotated_by_user_uuid: string | null;
    last_used_at: Date | null;
};

type DbCreateScimOrganizationAccessToken = Omit<
    DbScimOrganizationAccessToken,
    | 'scim_organization_access_token_uuid'
    | 'created_at'
    | 'rotated_at'
    | 'last_used_at'
    | 'rotated_by_user_uuid'
>;

type DbRotatePersonalAccessToken = {
    token_hash: string;
    rotated_at: Date;
    rotated_by_user_uuid: string;
    expires_at: Date;
};

type DbUpdateUsedDatePersonalAccessToken = {
    last_used_at: Date;
};

export type ScimOrganizationAccessTokenTable = Knex.CompositeTableType<
    DbScimOrganizationAccessToken,
    DbCreateScimOrganizationAccessToken,
    DbRotatePersonalAccessToken | DbUpdateUsedDatePersonalAccessToken
>;
export const ScimOrganizationAccessTokenTableName =
    'scim_organization_access_tokens';
