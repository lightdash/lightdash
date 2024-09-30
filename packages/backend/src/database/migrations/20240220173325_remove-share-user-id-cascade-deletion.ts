import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('share', (tableBuilder) => {
        tableBuilder.dropForeign('created_by_user_id');

        tableBuilder.integer('created_by_user_id').nullable().alter();

        tableBuilder
            .foreign('created_by_user_id')
            .references('user_id')
            .inTable('users')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('share').delete().whereNull('created_by_user_id');

    await knex.schema.alterTable('share', (tableBuilder) => {
        tableBuilder.dropForeign('created_by_user_id');

        tableBuilder.integer('created_by_user_id').notNullable().alter();

        tableBuilder
            .foreign('created_by_user_id')
            .references('user_id')
            .inTable('users')
            .onDelete('CASCADE');
    });
}
