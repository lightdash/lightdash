import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';
const IndexName = 'ai_thread_organization_uuid_index';

// CREATE INDEX CONCURRENTLY cannot run inside a transaction, so every step
// below is idempotent and resumable after an interrupted run.
export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds an index concurrently on ai_thread.organization_uuid without holding a write lock; no reads or writes are affected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        // An interrupted concurrent build leaves an INVALID index under the
        // same name that IF NOT EXISTS would silently keep.
        const invalid = await knex.raw(
            `SELECT 1 FROM pg_index i
             JOIN pg_class c ON c.oid = i.indexrelid
             WHERE c.relname = '${IndexName}' AND NOT i.indisvalid`,
        );
        if (invalid.rowCount > 0) {
            await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`);
        }

        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${IndexName} ON ?? (organization_uuid)`,
            [AiThreadTableName],
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
