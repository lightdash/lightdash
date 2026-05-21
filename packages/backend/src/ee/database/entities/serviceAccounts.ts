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
    // Nullable at the DB level. NOT NULL is intentionally deferred to a
    // follow-up migration (expand-contract): keeping the column nullable
    // for one deploy cycle removes the rolling-deploy / rollback trap
    // where old code (without `ServiceAccountModel.save` populating this
    // column) would hit a NOT NULL violation. Application code always
    // populates it for new rows; the backfill ensures all existing rows
    // have it set; the follow-up will promote NOT NULL after stability.
    service_account_user_uuid: string | null;
};

type DbCreateServiceAccount = Omit<
    DbServiceAccounts,
    | 'service_account_uuid'
    | 'created_at'
    | 'rotated_at'
    | 'last_used_at'
    | 'rotated_by_user_uuid'
    | 'service_account_user_uuid'
> &
    Partial<Pick<DbServiceAccounts, 'service_account_user_uuid'>>;

type DbRotateServiceAccount = {
    token_hash: string;
    rotated_at: Date;
    rotated_by_user_uuid: string;
    expires_at: Date;
};

type DbUpdateUsedDatePersonalAccessToken = {
    last_used_at: Date;
};

// Used by the backfill migration only; production code never NULLs the link.
type DbBackfillServiceAccountUserUuid = {
    service_account_user_uuid: string | null;
};

export type ServiceAccountTable = Knex.CompositeTableType<
    DbServiceAccounts,
    DbCreateServiceAccount,
    | DbRotateServiceAccount
    | DbUpdateUsedDatePersonalAccessToken
    | DbBackfillServiceAccountUserUuid
>;
export const ServiceAccountsTableName = 'service_accounts';
