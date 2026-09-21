import type { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable Document search vector with batched backfill and a concurrent index without changing existing content or permissions',
} as const;

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex
            .raw(
                'ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector',
            )
            .connection(connection);
        await knex
            .raw(`
            CREATE OR REPLACE FUNCTION update_document_search_vector()
            RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('lightdash_english_config', coalesce(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('lightdash_english_config', coalesce(NEW.description, '')), 'B');
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `)
            .connection(connection);
        await knex
            .raw(`
            CREATE OR REPLACE TRIGGER document_search_vector_update
            BEFORE INSERT OR UPDATE OF name, description ON documents
            FOR EACH ROW EXECUTE FUNCTION update_document_search_vector();
        `)
            .connection(connection);
        let remaining = true;
        while (remaining) {
            // Each batch must commit before selecting the next unindexed rows.
            // eslint-disable-next-line no-await-in-loop
            const result = await knex
                .raw(`
                UPDATE documents SET search_vector =
                    setweight(to_tsvector('lightdash_english_config', coalesce(name, '')), 'A') ||
                    setweight(to_tsvector('lightdash_english_config', coalesce(description, '')), 'B')
                WHERE document_id IN (
                    SELECT document_id FROM documents WHERE search_vector IS NULL LIMIT 10000
                );
            `)
                .connection(connection);
            remaining = result.rowCount > 0;
        }
        const invalidIndex = await knex('pg_index')
            .join('pg_class', 'pg_class.oid', 'pg_index.indexrelid')
            .where('pg_class.relname', 'documents_search_vector_idx')
            .where('pg_index.indisvalid', false)
            .first()
            .connection(connection);
        if (invalidIndex) {
            await knex
                .raw(
                    'DROP INDEX CONCURRENTLY IF EXISTS documents_search_vector_idx',
                )
                .connection(connection);
        }
        console.log('Creating Document search index');
        await knex
            .raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_search_vector_idx
            ON documents USING GIN (search_vector);
        `)
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET statement_timeout').connection(connection);
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS documents_search_vector_idx',
            )
            .connection(connection);
        await knex
            .raw(
                'DROP TRIGGER IF EXISTS document_search_vector_update ON documents',
            )
            .connection(connection);
        await knex
            .raw('DROP FUNCTION IF EXISTS update_document_search_vector()')
            .connection(connection);
        await knex
            .raw('ALTER TABLE documents DROP COLUMN IF EXISTS search_vector')
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
