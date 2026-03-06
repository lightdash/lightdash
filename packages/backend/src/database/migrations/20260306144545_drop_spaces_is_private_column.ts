import { Knex } from 'knex';

const SPACES_TABLE = 'spaces';
const IS_PRIVATE_COLUMN = 'is_private';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SPACES_TABLE, IS_PRIVATE_COLUMN)) {
        await knex.schema.alterTable(SPACES_TABLE, (table) => {
            table.dropColumn(IS_PRIVATE_COLUMN);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(SPACES_TABLE, IS_PRIVATE_COLUMN))) {
        await knex.schema.alterTable(SPACES_TABLE, (table) => {
            table.boolean(IS_PRIVATE_COLUMN).notNullable().defaultTo(true);
        });
    }
}
