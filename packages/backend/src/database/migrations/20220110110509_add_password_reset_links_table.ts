import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
CREATE TABLE IF NOT EXISTS password_reset_links (
    code_hash text PRIMARY KEY,
    email_id integer NOT NULL REFERENCES emails (email_id) ON DELETE CASCADE,
    created_at timestamp without time zone NOT NULL DEFAULT NOW(),
    expires_at timestamp without time zone NOT NULL,
    CONSTRAINT expires_at_after_created_at_check CHECK (expires_at >= created_at)
);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('password_reset_links');
}
