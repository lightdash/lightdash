import { Knex } from 'knex';

const TableName = 'scim_organization_access_tokens';
const UsersTableName = 'users';
const OrganizationsTableName = 'organizations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(TableName, (table) => {
        table
            .uuid('scim_organization_access_token_uuid')
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .primary();
        table.uuid('organization_uuid').notNullable().index();
        table.text('description').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
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
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(TableName);
}
