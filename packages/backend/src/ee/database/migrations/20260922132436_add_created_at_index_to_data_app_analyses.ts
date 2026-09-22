import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Builds an index concurrently on data_app_analyses(created_at) for the retention sweep; no lock, idempotent.',
} as const;

// Concurrent index build; every statement is guarded so a retry resumes.
export const config = { transaction: false };

const indexName = 'data_app_analyses_created_at_idx';

export async function up(knex: Knex): Promise<void> {
    // A concurrent build that was interrupted leaves an invalid index that
    // IF NOT EXISTS would keep; drop it so the retry rebuilds a usable one.
    await knex.raw(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                WHERE c.relname = '${indexName}' AND NOT i.indisvalid
            ) THEN
                DROP INDEX CONCURRENTLY ${indexName};
            END IF;
        END $$;
    `);
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON data_app_analyses (created_at)`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`);
}
