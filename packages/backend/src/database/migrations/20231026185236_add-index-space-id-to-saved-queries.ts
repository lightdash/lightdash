import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('saved_queries')) {
        await knex.schema.alterTable('saved_queries', (table) => {
            table.index(['space_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('saved_queries')) {
        await knex.schema.alterTable('saved_queries', (table) => {
            table.dropIndex(['space_id']);
        });
    }
}
