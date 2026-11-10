import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Expands the recent-content type constraint without scanning or backfilling existing rows; existing chart and dashboard writes remain valid.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        ALTER TABLE user_recent_content
            DROP CONSTRAINT user_recent_content_content_type_check,
            ADD CONSTRAINT user_recent_content_content_type_check
                CHECK (content_type IN ('chart', 'dashboard', 'data_app')) NOT VALID
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex('user_recent_content')
        .where('content_type', 'data_app')
        .delete();
    await knex.raw(`
        ALTER TABLE user_recent_content
            DROP CONSTRAINT user_recent_content_content_type_check,
            ADD CONSTRAINT user_recent_content_content_type_check
                CHECK (content_type IN ('chart', 'dashboard')) NOT VALID
    `);
}
