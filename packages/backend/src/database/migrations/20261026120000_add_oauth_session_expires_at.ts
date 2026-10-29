import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable OAuth session deadlines without changing existing rows or requiring old servers to write them',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        'ALTER TABLE oauth2_authorization_codes ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ NULL',
    );
    await knex.raw(
        'ALTER TABLE oauth2_access_tokens ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ NULL',
    );
    await knex.raw(
        'ALTER TABLE oauth2_refresh_tokens ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ NULL',
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        'ALTER TABLE oauth2_refresh_tokens DROP COLUMN IF EXISTS session_expires_at',
    );
    await knex.raw(
        'ALTER TABLE oauth2_access_tokens DROP COLUMN IF EXISTS session_expires_at',
    );
    await knex.raw(
        'ALTER TABLE oauth2_authorization_codes DROP COLUMN IF EXISTS session_expires_at',
    );
}
