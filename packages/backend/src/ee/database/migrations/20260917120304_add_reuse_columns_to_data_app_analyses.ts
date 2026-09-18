import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable columns and a concurrent index to data_app_analyses',
} as const;

// Concurrent index build; every statement is guarded so a retry resumes.
export const config = { transaction: false };

const tableName = 'data_app_analyses';

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
    // A concurrent build that was interrupted leaves an invalid index that
    // IF NOT EXISTS would keep; drop it so the retry rebuilds a usable one.
    await knex.raw(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                WHERE c.relname = 'data_app_analyses_reuse_idx' AND NOT i.indisvalid
            ) THEN
                DROP INDEX CONCURRENTLY data_app_analyses_reuse_idx;
            END IF;
        END $$;
    `);
    await knex.raw(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS data_app_analyses_reuse_idx ON data_app_analyses (app_id, app_version, content_hash, created_at DESC) WHERE operation = 'detect'",
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        'DROP INDEX CONCURRENTLY IF EXISTS data_app_analyses_reuse_idx',
    );
    if (await knex.schema.hasColumn(tableName, 'content_hash')) {
        await knex.schema.alterTable(tableName, (table) => {
            table.dropColumn('reused_from_analysis_uuid');
            table.dropColumn('source_hashes');
            table.dropColumn('content_hash');
        });
    }
}
