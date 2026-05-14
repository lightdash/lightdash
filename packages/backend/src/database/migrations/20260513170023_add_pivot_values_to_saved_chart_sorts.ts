import { Knex } from 'knex';

const TABLE = 'saved_queries_version_sorts';
const COLUMN = 'pivot_values';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
    if (!hasColumn) {
        await knex.schema.alterTable(TABLE, (table) => {
            table.jsonb(COLUMN).nullable();
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
