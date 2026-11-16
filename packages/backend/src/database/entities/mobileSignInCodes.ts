import { Knex } from 'knex';

export const MobileSignInCodesTableName = 'mobile_sign_in_codes';

export type DbMobileSignInCodeStatus =
    | 'pending'
    | 'claimed'
    | 'approved'
    | 'declined'
    | 'redeemed';

export type DbMobileSignInDeclinedBy = 'web' | 'phone' | 'failed_redeems';

export type DbMobileSignInCode = {
    mobile_sign_in_code_uuid: string;
    code_hash: string;
    user_uuid: string;
    organization_uuid: string;
    session_id_hash: string;
    approval_nonce_hash: string;
    status: DbMobileSignInCodeStatus;
    client_id: string | null;
    code_challenge: string | null;
    reported_platform: string | null;
    match_number: number | null;
    failed_redeems: number;
    last_redeem_attempt_at: Date | null;
    expires_at: Date;
    created_at: Date;
    claimed_at: Date | null;
    decided_at: Date | null;
    redeemed_at: Date | null;
    declined_by: DbMobileSignInDeclinedBy | null;
};

type DbMobileSignInCodeInsert = Pick<
    DbMobileSignInCode,
    | 'mobile_sign_in_code_uuid'
    | 'code_hash'
    | 'user_uuid'
    | 'organization_uuid'
    | 'session_id_hash'
    | 'approval_nonce_hash'
> & {
    expires_at: Date | Knex.Raw;
};

type Updatable<T> = { [K in keyof T]?: T[K] | Knex.Raw };

type DbMobileSignInCodeUpdate = Updatable<DbMobileSignInCode>;

export type MobileSignInCodesTable = Knex.CompositeTableType<
    DbMobileSignInCode,
    DbMobileSignInCodeInsert,
    DbMobileSignInCodeUpdate
>;
