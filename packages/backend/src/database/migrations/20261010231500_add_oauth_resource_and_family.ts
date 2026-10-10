import type { Knex } from 'knex';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds nullable OAuth resource and family columns with concurrent indexes without changing existing rows',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw("SET lock_timeout = '5s'");
        await knex.raw(
            'ALTER TABLE oauth2_authorization_codes ADD COLUMN IF NOT EXISTS resource TEXT NULL',
        );
        await knex.raw(
            'ALTER TABLE oauth2_access_tokens ADD COLUMN IF NOT EXISTS resource TEXT NULL, ADD COLUMN IF NOT EXISTS family_uuid UUID NULL',
        );
        await knex.raw(
            'ALTER TABLE oauth2_refresh_tokens ADD COLUMN IF NOT EXISTS resource TEXT NULL, ADD COLUMN IF NOT EXISTS family_uuid UUID NULL',
        );
        const invalidAccess = await knex.raw(
            "SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'oauth2_access_tokens_family_uuid_idx' AND NOT i.indisvalid",
        );
        if (invalidAccess.rows.length > 0)
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS oauth2_access_tokens_family_uuid_idx',
            );
        const invalidRefresh = await knex.raw(
            "SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'oauth2_refresh_tokens_family_uuid_idx' AND NOT i.indisvalid",
        );
        if (invalidRefresh.rows.length > 0)
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS oauth2_refresh_tokens_family_uuid_idx',
            );
        await knex.raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_access_tokens_family_uuid_idx ON oauth2_access_tokens (family_uuid)',
        );
        await knex.raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_refresh_tokens_family_uuid_idx ON oauth2_refresh_tokens (family_uuid)',
        );
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS oauth2_access_tokens_family_uuid_idx',
        );
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS oauth2_refresh_tokens_family_uuid_idx',
        );
        await knex.raw(
            'ALTER TABLE oauth2_refresh_tokens DROP COLUMN IF EXISTS resource, DROP COLUMN IF EXISTS family_uuid',
        );
        await knex.raw(
            'ALTER TABLE oauth2_access_tokens DROP COLUMN IF EXISTS resource, DROP COLUMN IF EXISTS family_uuid',
        );
        await knex.raw(
            'ALTER TABLE oauth2_authorization_codes DROP COLUMN IF EXISTS resource',
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
