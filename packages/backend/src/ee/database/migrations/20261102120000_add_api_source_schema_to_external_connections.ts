import { type Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable api_source_schema jsonb column to external_connections. Older readers ignore it.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.jsonb('api_source_schema').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('api_source_schema');
    });
}
