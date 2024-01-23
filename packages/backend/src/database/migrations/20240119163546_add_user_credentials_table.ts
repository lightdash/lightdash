import { Knex } from 'knex';

const userWarehouseCredentialsTableName = 'user_warehouse_credentials';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(userWarehouseCredentialsTableName))) {
        await knex.schema.createTable(
            userWarehouseCredentialsTableName,
            (tableBuilder) => {
                tableBuilder
                    .uuid('user_warehouse_credentials_uuid')
                    .primary()
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder
                    .uuid('user_uuid')
                    .notNullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('CASCADE');
                tableBuilder.text('name').notNullable();
                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder
                    .timestamp('updated_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder
                    .string('warehouse_type')
                    .notNullable()
                    .references('warehouse_type')
                    .inTable('warehouse_types')
                    .onDelete('CASCADE');
                tableBuilder.binary('encrypted_credentials').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(userWarehouseCredentialsTableName);
}
