import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('shopify_shops', (table) => {
        table.increments('shop_id').primary();
        table.uuid('shop_uuid').notNullable().unique();

        table
            .uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');

        table.string('name').notNullable();
        table.string('shop_url').notNullable();
        table.specificType('domains', 'text[]').nullable();
        table.string('access_token').notNullable();
        table.string('subscription_id').nullable();

        table.timestamp('subscription_period_start', { useTz: false }).notNullable();
        table.timestamp('subscription_period_end', { useTz: false }).nullable();

        table.boolean('is_first_login').defaultTo(true).notNullable();
        table.boolean('is_uninstalled').defaultTo(false).notNullable();
        table.boolean('is_beta').defaultTo(false).notNullable();

        table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now()).notNullable();
        table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now()).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('shopify_shops');
}
