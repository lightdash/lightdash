import { Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';
const CustomHeadersColumn = 'custom_headers';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        // Static non-secret request headers injected on every proxied request
        // (e.g. anthropic-version). Null when the connection has none.
        table.jsonb(CustomHeadersColumn).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn(CustomHeadersColumn);
    });
}
