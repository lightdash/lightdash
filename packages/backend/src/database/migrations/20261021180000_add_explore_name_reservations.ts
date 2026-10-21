import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'This migration adds a constant default column and keeps existing allocation writes valid without rewriting rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('explore_name_allocations', (table) => {
        table.boolean('is_reserved').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex('explore_name_allocations').where('is_reserved', true).delete();
    await knex.schema.alterTable('explore_name_allocations', (table) => {
        table.dropColumn('is_reserved');
    });
}
