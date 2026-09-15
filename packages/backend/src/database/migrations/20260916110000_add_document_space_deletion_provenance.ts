import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean without rewriting existing document content',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('documents', (table) => {
        table.boolean('deleted_with_space').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('documents', (table) => {
        table.dropColumn('deleted_with_space');
    });
}
