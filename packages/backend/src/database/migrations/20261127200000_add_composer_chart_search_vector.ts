import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a generated search vector and GIN index to composer charts without changing content or permissions',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(`
        ALTER TABLE composer_charts ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('lightdash_english_config', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('lightdash_english_config', coalesce(description, '')), 'B')
        ) STORED;
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS composer_charts_search_vector_idx
        ON composer_charts USING GIN (search_vector);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('composer_charts', (table) => {
        table.dropColumn('search_vector');
    });
}
