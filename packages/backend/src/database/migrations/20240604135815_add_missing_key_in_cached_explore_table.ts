import { Knex } from 'knex';

const table = 'cached_explore';
const columnToIndex = 'project_uuid';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(table)) {
        await knex.schema.alterTable(table, (tableBuilder) => {
            tableBuilder.index([columnToIndex]);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(table)) {
        await knex.schema.alterTable(table, (tableBuilder) => {
            tableBuilder.dropIndex([columnToIndex]);
        });
    }
}
