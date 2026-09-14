import { type Knex } from 'knex';
import { ExternalConnectionsTableName } from '../entities/externalConnections';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table
            .boolean('allow_data_app_builder_linking')
            .notNullable()
            .defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('allow_data_app_builder_linking');
    });
}
