import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
CREATE TABLE IF NOT EXISTS themes (
    theme_id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    organization_id integer NOT NULL REFERENCES organizations (organization_id) ON DELETE CASCADE,
    created_at timestamp without time zone NOT NULL DEFAULT NOW(),
    colours TEXT []
);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('themes');
}
