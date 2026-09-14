import { type MobilePlatform } from '@lightdash/common';
import { Knex } from 'knex';

export const MobileSetupCodesTableName = 'mobile_setup_codes';

export type DbMobileSetupCode = {
    mobile_setup_code_uuid: string;
    code_hash: string;
    user_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_at: Date;
    expires_at: Date;
    redeemed_at: Date | null;
    redeemed_client_id: string | null;
    redeemed_platform: MobilePlatform | null;
    revoked_at: Date | null;
};

export type DbMobileSetupCodeIn = Pick<
    DbMobileSetupCode,
    | 'code_hash'
    | 'user_uuid'
    | 'organization_uuid'
    | 'project_uuid'
    | 'expires_at'
>;

export type MobileSetupCodesTable = Knex.CompositeTableType<
    DbMobileSetupCode,
    DbMobileSetupCodeIn,
    Partial<Omit<DbMobileSetupCode, 'redeemed_at' | 'revoked_at'>> & {
        redeemed_at?: Date | Knex.Raw;
        revoked_at?: Date | Knex.Raw;
    }
>;
