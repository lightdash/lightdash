import { Knex } from 'knex';

const USERS_TABLE_NAME = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(USERS_TABLE_NAME, (tableBuilder) => {
        tableBuilder
            .timestamp('updated_at')
            .defaultTo(knex.fn.now())
            .notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(USERS_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('updated_at');
    });
}
