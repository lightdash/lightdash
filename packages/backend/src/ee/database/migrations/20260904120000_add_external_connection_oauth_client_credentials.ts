import { type Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.text('oauth_token_url').nullable();
        table.text('oauth_client_id').nullable();
        table.text('oauth_client_auth_method').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumns(
            'oauth_token_url',
            'oauth_client_id',
            'oauth_client_auth_method',
        );
    });
}
