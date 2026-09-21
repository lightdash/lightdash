import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a generated search vector and GIN index for unreleased Documents without changing content or permissions',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('lightdash_english_config', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('lightdash_english_config', coalesce(description, '')), 'B')
        ) STORED;
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS documents_search_vector_idx
        ON documents USING GIN (search_vector);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('documents', (table) => {
        table.dropColumn('search_vector');
    });
}
