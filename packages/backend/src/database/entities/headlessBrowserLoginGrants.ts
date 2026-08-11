import { Knex } from 'knex';

export const HeadlessBrowserLoginGrantsTableName =
    'headless_browser_login_grants';

export type DbHeadlessBrowserLoginGrant = {
    token_hash: string;
    user_uuid: string;
    expires_at: Date;
    created_at: Date;
};

type DbHeadlessBrowserLoginGrantInsert = Omit<
    DbHeadlessBrowserLoginGrant,
    'created_at'
>;

export type HeadlessBrowserLoginGrantTable = Knex.CompositeTableType<
    DbHeadlessBrowserLoginGrant,
    DbHeadlessBrowserLoginGrantInsert
>;
