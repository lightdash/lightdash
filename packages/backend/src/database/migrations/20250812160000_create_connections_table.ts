import { Knex } from 'knex';
import { ConnectionsTableName } from '../entities/connections';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ConnectionsTableName, (table) => {
        table.increments('connection_id').primary();
        table.uuid('connection_uuid').notNullable().unique();
        table.string('type').notNullable();
        table.uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table.text('access_token').notNullable();
        table.text('refresh_token').nullable();
        table.string('property_id').nullable();
        table.timestamp('expires_at').nullable();
        table.string('shop_url').nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ConnectionsTableName);
}
