import { Knex } from 'knex';

export type DbServiceAccounts = {
    service_account_uuid: string;
    token_hash: string;
    organization_uuid: string;
    created_at: Date;
    description: string;
    expires_at: Date | null;
    created_by_user_uuid: string | null;
    rotated_at: Date | null;
    rotated_by_user_uuid: string | null;
    last_used_at: Date | null;
    scopes: string[];
};

type DbCreateServiceAccount = Omit<
    DbServiceAccounts,
    | 'service_account_uuid'
    | 'created_at'
    | 'rotated_at'
    | 'last_used_at'
    | 'rotated_by_user_uuid'
>;

type DbRotateServiceAccount = {
    token_hash: string;
    rotated_at: Date;
    rotated_by_user_uuid: string;
    expires_at: Date;
};

type DbUpdateUsedDatePersonalAccessToken = {
    last_used_at: Date;
};

export type ServiceAccountTable = Knex.CompositeTableType<
    DbServiceAccounts,
    DbCreateServiceAccount,
    DbRotateServiceAccount | DbUpdateUsedDatePersonalAccessToken
>;
export const ServiceAccountsTableName = 'service_accounts';
