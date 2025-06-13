import { Knex } from 'knex';

const ScimTableName = 'scim_organization_access_tokens';
const ServiceAccountsTableName = 'service_accounts';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ScimTableName)) {
        await knex.schema.renameTable(ScimTableName, ServiceAccountsTableName);

        await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
            table.renameColumn(
                'scim_organization_access_token_uuid',
                'service_account_uuid',
            );
            table
                .specificType('scopes', 'text[]')
                .notNullable()
                .defaultTo('{"scim:manage"}'); // Assing temporary default, so all existing records have scim scope
        });

        // Remove the default so future inserts must specify scopes and don't default to scim
        await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
            table.specificType('scopes', 'text[]').notNullable().alter();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ServiceAccountsTableName)) {
        await knex.schema.renameTable(ServiceAccountsTableName, ScimTableName);
        await knex.schema.alterTable(ScimTableName, (table) => {
            table.renameColumn(
                'service_account_uuid',
                'scim_organization_access_token_uuid',
            );
            table.dropColumn('scopes');
        });
    }
}
