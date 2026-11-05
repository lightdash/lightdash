import { type Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';
const KIND_CHECK = 'external_connections_connection_kind_check';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable api_source column and a connection_kind column defaulting to data_app with a validated CHECK. Existing connections stay data_app and older readers ignore both columns.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
            table.jsonb('api_source').nullable();
            table.text('connection_kind').notNullable().defaultTo('data_app');
        });
        await knex.raw(`
            ALTER TABLE ${ExternalConnectionsTableName} ADD CONSTRAINT ${KIND_CHECK}
            CHECK (connection_kind IN ('data_app', 'live_source')) NOT VALID
        `);
        await knex.raw(
            `ALTER TABLE ${ExternalConnectionsTableName} VALIDATE CONSTRAINT ${KIND_CHECK}`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
            table.dropColumn('connection_kind');
            table.dropColumn('api_source');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
