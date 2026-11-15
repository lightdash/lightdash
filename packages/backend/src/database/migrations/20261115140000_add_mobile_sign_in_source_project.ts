import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable code metadata without a backfill or changes to existing columns. Older releases ignore the new column.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('mobile_sign_in_codes', (table) => {
        table.uuid('sign_in_source_project_uuid').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('mobile_sign_in_codes', (table) => {
        table.dropColumn('sign_in_source_project_uuid');
    });
}
