import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable OAuth client identifier without rewriting existing Linear installations',
} as const;

const tableName = 'linear_app_installations';
const columnName = 'oauth_client_id';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (!(await knex.schema.hasColumn(tableName, columnName))) {
        await knex.schema.alterTable(tableName, (tableBuilder) => {
            tableBuilder.string(columnName).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (await knex.schema.hasColumn(tableName, columnName)) {
        await knex.schema.alterTable(tableName, (tableBuilder) => {
            tableBuilder.dropColumn(columnName);
        });
    }
}
