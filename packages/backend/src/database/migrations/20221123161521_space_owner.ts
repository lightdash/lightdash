import { Knex } from 'knex';

const SPACE_TABLE_NAME = 'spaces';
const CREATED_BY_COLUMN_NAME = 'created_by_user_id';
export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(SPACE_TABLE_NAME, (tableBuilder) => {
        tableBuilder
            .integer(CREATED_BY_COLUMN_NAME)
            .references('user_id')
            .inTable('users')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SPACE_TABLE_NAME, CREATED_BY_COLUMN_NAME)) {
        await knex.schema.table(SPACE_TABLE_NAME, (table) => {
            table.dropColumn(CREATED_BY_COLUMN_NAME);
        });
    }
}
