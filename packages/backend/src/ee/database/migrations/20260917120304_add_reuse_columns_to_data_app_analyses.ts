import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable columns and a concurrent index to data_app_analyses',
} as const;

// Concurrent index build; every statement is guarded so a retry resumes.
export const config = { transaction: false };

const tableName = 'data_app_analyses';
const indexName = 'data_app_analyses_reuse_idx';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(tableName, 'content_hash'))) {
        await knex.schema.alterTable(tableName, (table) => {
            // Hash of what the model read: sorted per-source section hashes
            // plus the author instructions. Equal hash means identical rows.
            table.text('content_hash').nullable();
            // [{ queryUuid, hash }] so a later viewer's queries can be
            // mapped onto the stored anomalies.
            table.jsonb('source_hashes').nullable();
            table
                .uuid('reused_from_analysis_uuid')
                .nullable()
                .references('data_app_analysis_uuid')
                .inTable(tableName)
                .onDelete('SET NULL');
        });
    }
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${tableName} (app_id, app_version, content_hash, created_at DESC) WHERE operation = 'detect'`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`);
    if (await knex.schema.hasColumn(tableName, 'content_hash')) {
        await knex.schema.alterTable(tableName, (table) => {
            table.dropColumn('reused_from_analysis_uuid');
            table.dropColumn('source_hashes');
            table.dropColumn('content_hash');
        });
    }
}
