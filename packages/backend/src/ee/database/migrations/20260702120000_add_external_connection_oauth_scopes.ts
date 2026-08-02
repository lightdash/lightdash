import { Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';
const OAuthScopesColumn = 'oauth_scopes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        // OAuth scopes for type 'google_service_account'; null for other types.
        table.jsonb(OAuthScopesColumn).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn(OAuthScopesColumn);
    });
}
