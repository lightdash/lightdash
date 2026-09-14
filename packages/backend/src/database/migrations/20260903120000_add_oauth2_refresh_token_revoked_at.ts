import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable revoked_at column and a concurrent lookup index to oauth2_refresh_tokens',
} as const;

export const config = { transaction: false };

const tableName = 'oauth2_refresh_tokens';
const userClientIndex = 'oauth2_refresh_tokens_user_id_client_id_idx';

const dropInvalidIndex = async (knex: Knex): Promise<void> => {
    const invalid = await knex.raw(
        `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${userClientIndex}' AND NOT i.indisvalid`,
    );
    if (invalid.rows.length > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${userClientIndex}`);
    }
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`SET lock_timeout = '5s'`);
        await knex.raw(
            `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP NULL`,
        );
        await knex.raw('RESET lock_timeout');

        await dropInvalidIndex(knex);
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${userClientIndex} ON ${tableName} (user_id, client_id)`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${userClientIndex}`);
        await knex.raw(`SET lock_timeout = '5s'`);
        await knex.raw(
            `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS revoked_at`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}
