import { type Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.boolean('forward_user_identity').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('forward_user_identity');
    });
}
