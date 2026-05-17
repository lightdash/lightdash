import { Knex } from 'knex';

const TABLE = 'query_history';
const COLUMN = 'error_name';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
    if (!hasColumn) {
        await knex.schema.alterTable(TABLE, (table) => {
            table.string(COLUMN, 255).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
    if (hasColumn) {
        await knex.schema.alterTable(TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    }
}
