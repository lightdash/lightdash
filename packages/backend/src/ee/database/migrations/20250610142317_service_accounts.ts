import { Knex } from 'knex';

const ScimTableName = 'scim_organization_access_tokens';
const ServiceAccountsTableName = 'service_accounts';
const UsersTableName = 'users';
const OrganizationsTableName = 'organizations';

export async function up(knex: Knex): Promise<void> {
    // Step 1: Create the new service_accounts table if it doesn't exist
    if (
        !(await knex.schema.hasTable(ServiceAccountsTableName)) &&
        (await knex.schema.hasTable(ScimTableName))
    ) {
        // Create new table with desired structure
        await knex.schema.createTable(ServiceAccountsTableName, (table) => {
            // Copy structure from original table
            table
                .uuid('service_account_uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .primary();
            table.uuid('organization_uuid').notNullable().index();
            table.text('description').notNullable();
            table
                .timestamp('created_at')
                .notNullable()
                .defaultTo(knex.fn.now());
            table.text('token_hash').notNullable().unique(); // note the unique constraint/index
            table.timestamp('expires_at').nullable();
            table.uuid('created_by_user_uuid').nullable();
            table
                .foreign('organization_uuid')
                .references('organization_uuid')
                .inTable(OrganizationsTableName)
                .onDelete('CASCADE');
            table
                .foreign('created_by_user_uuid')
                .references('user_uuid')
                .inTable(UsersTableName)
                .onDelete('SET NULL');
            // Copied from scim, done on a later migration
            table.timestamp('rotated_at', { useTz: false }).nullable();
            table
                .uuid('rotated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            table.timestamp('last_used_at', { useTz: false }).nullable();
            // New column for service accounts
            table.specificType('scopes', 'text[]').notNullable();
        });
        // Step 2: Copy data from old table to new table
        const scimTokens = await knex(ScimTableName).select('*');

        if (scimTokens.length > 0) {
            const serviceAccounts = scimTokens.map((token) => ({
                service_account_uuid: token.scim_organization_access_token_uuid,
                description: token.description,
                token_hash: token.token_hash,
                created_at: token.created_at,
                expires_at: token.expires_at,
                organization_uuid: token.organization_uuid,
                created_by_user_uuid: token.created_by_user_uuid,
                rotated_at: token.rotated_at,
                rotated_by_user_uuid: token.rotated_by_user_uuid,
                last_used_at: token.last_used_at,
                scopes: ['scim:manage'],
            }));

            await knex(ServiceAccountsTableName).insert(serviceAccounts);
        }

        // Note: We keep the old table for now to maintain backward compatibility
        // A future migration will remove it after the code is updated
    }
}
export async function down(knex: Knex): Promise<void> {
    // If we need to roll back, simply drop the new table
    // The old table is still intact
    if (await knex.schema.hasTable(ServiceAccountsTableName)) {
        await knex.schema.dropTable(ServiceAccountsTableName);
    }
}
