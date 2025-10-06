import { Knex } from 'knex';

const ORGANIZATION_WAREHOUSE_CREDENTIALS_TABLE =
    'organization_warehouse_credentials';

export async function up(knex: Knex): Promise<void> {
    // Create organization_warehouse_credentials table
    await knex.schema.createTable(
        ORGANIZATION_WAREHOUSE_CREDENTIALS_TABLE,
        (table) => {
            table
                .uuid('organization_warehouse_credentials_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.string('name').notNullable();
            table.text('description').nullable();
            table.string('warehouse_type').notNullable();
            table.binary('warehouse_connection').notNullable(); // encrypted credentials
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');

            table.index('created_by_user_uuid');
            table.index('organization_uuid');
        },
    );

    // Add organization_warehouse_credentials_uuid to projects table
    await knex.schema.table('projects', (table) => {
        table
            .uuid('organization_warehouse_credentials_uuid')
            .nullable()
            .references('organization_warehouse_credentials_uuid')
            .inTable(ORGANIZATION_WAREHOUSE_CREDENTIALS_TABLE)
            .onDelete('RESTRICT'); // throw errors if trying to delete a warehouse credential that is still in use in a project
        table.index('organization_warehouse_credentials_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Remove foreign key from projects table
    await knex.schema.table('projects', (table) => {
        table.dropColumn('organization_warehouse_credentials_uuid');
    });

    // Drop organization_warehouse_credentials table
    await knex.schema.dropTableIfExists(
        ORGANIZATION_WAREHOUSE_CREDENTIALS_TABLE,
    );
}
