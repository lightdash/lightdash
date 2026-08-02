import { Knex } from 'knex';

const WarehouseConnectCodesTableName = 'warehouse_connect_codes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(WarehouseConnectCodesTableName, (table) => {
        table
            .uuid('warehouse_connect_code_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('code_hash').notNullable().unique();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('used_at', { useTz: true }).nullable();
        table.binary('encrypted_credentials').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(WarehouseConnectCodesTableName);
}
