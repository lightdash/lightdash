import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';
const IndexName = 'ai_writeback_thread_pull_request_uuid_index';

// CREATE INDEX CONCURRENTLY can't run inside a transaction.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    const hasTable = await knex.schema.hasTable(AiWritebackThreadTableName);
    if (!hasTable) {
        return;
    }
    // Index the FK column so the ON DELETE SET NULL cascade from pull_requests
    // and the parent→child join in PullRequestsModel.getAiThreadInfo don't
    // seq-scan. CONCURRENTLY + IF NOT EXISTS keeps it lock-light and idempotent.
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (pull_request_uuid)`,
        [IndexName, AiWritebackThreadTableName],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [IndexName]);
}
