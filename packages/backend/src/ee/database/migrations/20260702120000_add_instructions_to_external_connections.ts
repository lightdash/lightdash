import { Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.text('instructions').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('instructions');
    });
}
