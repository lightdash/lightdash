import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('sessions', (table) => {
        table.string('sid').notNullable().primary();
        table.jsonb('sess').notNullable();
        table.timestamp('expired').notNullable().index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('sessions');
}
