import { Knex } from 'knex';

const AiAgentMemoryTableName = 'ai_agent_memory';
const OldIndexName = 'ai_agent_memory_injection_ranking';
const NewIndexName = 'ai_agent_memory_injection_ranking_owner';

// CREATE/DROP INDEX CONCURRENTLY can't run inside a transaction.
export const config = { transaction: false };

// A crashed CONCURRENTLY build leaves an INVALID index behind that IF NOT EXISTS
// would then skip, so clear it before rebuilding.
async function dropInvalidIndex(knex: Knex, indexName: string): Promise<void> {
    const { rows } = await knex.raw(
        `SELECT 1 FROM pg_index
         JOIN pg_class ON pg_class.oid = pg_index.indexrelid
         WHERE pg_class.relname = ? AND NOT pg_index.indisvalid`,
        [indexName],
    );
    if (rows.length > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`);
    }
}

// Injection now ranks within one owner's memories, so the index leads with
// (project, owner) before the ordering columns. Built under a new name first so
// the ranking query is never left without a supporting index.
export async function up(knex: Knex): Promise<void> {
    // Without a transaction the migration lock isn't released if a timeout kills
    // the build, leaving operators to unlock knex_migrations_lock by hand.
    await knex.raw('SET statement_timeout = 0');
    try {
        await dropInvalidIndex(knex, NewIndexName);
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ${NewIndexName}
            ON ${AiAgentMemoryTableName} (project_uuid, user_uuid, last_cited_at DESC NULLS LAST, generated_at DESC)
            WHERE status = 'active'
        `);
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${OldIndexName}`);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await dropInvalidIndex(knex, OldIndexName);
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ${OldIndexName}
            ON ${AiAgentMemoryTableName} (project_uuid, last_cited_at DESC NULLS LAST, generated_at DESC)
            WHERE status = 'active'
        `);
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${NewIndexName}`);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
