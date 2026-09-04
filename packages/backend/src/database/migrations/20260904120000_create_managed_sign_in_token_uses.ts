import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new table that records single use of managed sign-in tokens',
} as const;

const tableName = 'managed_sign_in_token_uses';
const expiresAtIndex = 'managed_sign_in_token_uses_expires_at_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.raw(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
                token_hash CHAR(64) PRIMARY KEY,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);
        await knex.raw(
            `CREATE INDEX IF NOT EXISTS ${expiresAtIndex} ON ${tableName} (expires_at)`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.raw(`DROP INDEX IF EXISTS ${expiresAtIndex}`);
        await knex.raw(`DROP TABLE IF EXISTS ${tableName}`);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
