import { type MobileAppPlatform } from '@lightdash/common';
import { Knex } from 'knex';

export const MobileAppLinksTableName = 'mobile_app_links';

export type DbMobileAppLink = {
    mobile_app_link_uuid: string;
    scan_id_hash: string;
    user_uuid: string;
    organization_uuid: string;
    created_at: Date;
    expires_at: Date;
    first_scanned_at: Date | null;
    first_scan_platform: MobileAppPlatform | null;
    scan_count: number;
};

type DbMobileAppLinkInsert = Pick<
    DbMobileAppLink,
    'scan_id_hash' | 'user_uuid' | 'organization_uuid'
> & { expires_at: Date | Knex.Raw };

type DbMobileAppLinkUpdate = {
    first_scanned_at: Knex.Raw;
    first_scan_platform: Knex.Raw;
    scan_count: Knex.Raw;
};

export type MobileAppLinksTable = Knex.CompositeTableType<
    DbMobileAppLink,
    DbMobileAppLinkInsert,
    DbMobileAppLinkUpdate
>;

export const MobileAppLinkRateCountersTableName =
    'mobile_app_link_rate_counters';

export type DbMobileAppLinkRateCounter = {
    key_hash: string;
    operation: string;
    window_started_at: Date;
    request_count: number;
};

export type MobileAppLinkRateCountersTable = Knex.CompositeTableType<
    DbMobileAppLinkRateCounter,
    DbMobileAppLinkRateCounter,
    { request_count: Knex.Raw }
>;
