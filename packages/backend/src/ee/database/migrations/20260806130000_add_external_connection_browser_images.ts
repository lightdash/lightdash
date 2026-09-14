import { type Knex } from 'knex';
import { ExternalConnectionsTableName } from '../entities/externalConnections';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.boolean('allow_browser_images').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('allow_browser_images');
    });
}
